import BN from "bn.js";
import { placeFeeTokenLiquidityOrders } from "../src/fee_token_liquidity";
import { getOrdersPaginated } from "../src/onchain_reading";
import type { Order } from "../src/encoding";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.owl_liquidity");

const BatchExchange = artifacts.require("BatchExchange");
const MAXU32 = new BN(2).pow(new BN(32)).sub(new BN(1));
const MIN_OWL_LIQUIDITY = new BN(10).pow(new BN(17));
const SELL_AMOUNT_OWL = new BN(10).pow(new BN(18)).mul(new BN(5));

// All orders provided by this liquidity script will sell OWL for a very high price:
// At 1000 [token]/[OWL]. In most of the cases this will ensure that 1 [OWL] is valued
// higher than 1 dollar. For tokens valued below 1/10000 USD, OWL can be extracted profitably
// from these orders. However, since we only sell 5 OWL and 10 OWL have to be spent to add one token,
// stealing OWL by adding new tokens is not profitable.
const PRICE_FOR_PROVISION = new BN(10000);

const containsSellOrderProvidingLiquidity = function (orders: Order<BN>[]) {
  return orders.some(
    (order) =>
      order.sellTokenBalance.gt(MIN_OWL_LIQUIDITY) &&
      order.remainingAmount.gt(MIN_OWL_LIQUIDITY),
  );
};

// This function checks whether it is likely that Gnosis has already provided liquidity for this token
// with a liquidity-order. The check depends on the match of two order criteria: SellAmount and validUntil.
// Despite being just an heuristic check, it should be sufficient for now.
const hasOWLLiquidityOrderAlreadyBeenPlaced = function (orders: Order<BN>[]) {
  return orders.some(
    (order) =>
      order.priceDenominator.eq(SELL_AMOUNT_OWL) &&
      new BN(order.validUntil).eq(MAXU32),
  );
};

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const exchange = await BatchExchange.deployed();
    const owlTokenAddress = await exchange.tokenIdToAddressMap(0);
    const [liquidityEnsurer] = await web3.eth.getAccounts();
    log.info(`Using account ${liquidityEnsurer}`);
    // check that liquidityEnsurer has sufficient OWL in the exchange:
    const owlBalance = await exchange.getBalance(
      liquidityEnsurer,
      owlTokenAddress,
    );
    if (new BN(10).pow(new BN(18)).gt(owlBalance)) {
      callback(
        "Error: OWL balance is below the 10 OWL threshold, please stock it up again",
      );
    }

    // Get the order data
    const numTokens = (await exchange.numTokens()).toNumber();
    const batchId = (await exchange.getCurrentBatchId()).toNumber();
    log.info("Retrieving orders from exchange. This may take a while...");
    let orders = await getOrdersPaginated(exchange.contract, 100);
    orders = orders.filter(
      (order) => order.validUntil >= batchId && order.validFrom <= batchId,
    );

    // Ensure OWL-liquidity is given
    const tokensRequiringLiquidity = [];
    for (let tokenId = 1; tokenId < numTokens; tokenId++) {
      const tokenAddress = await exchange.tokenIdToAddressMap(tokenId);
      log.info(`Checking liquidity for token ${tokenId} - ${tokenAddress}`);
      const ordersForTokenId = orders.filter(
        (order) => order.buyToken == tokenId && order.sellToken == 0,
      );
      if (
        !containsSellOrderProvidingLiquidity(ordersForTokenId) &&
        !hasOWLLiquidityOrderAlreadyBeenPlaced(ordersForTokenId)
      ) {
        tokensRequiringLiquidity.push(tokenId);
      } else {
        log.info(
          `    Liquidity for ${tokenAddress} is given or has been provided in the past`,
        );
      }
    }
    if (tokensRequiringLiquidity) {
      log.info(
        `Attempting to place orders for tokens ${tokensRequiringLiquidity}`,
      );
      const res = await placeFeeTokenLiquidityOrders(
        exchange,
        tokensRequiringLiquidity,
        PRICE_FOR_PROVISION,
        SELL_AMOUNT_OWL,
        artifacts,
      );
      if (res && res.length) {
        log.info(`Placed fee token liquidity orders for tokens: ${res}`);
      } else {
        log.warn(
          `No orders placed. Tokens ${tokensRequiringLiquidity} may not be ERC20s on this network.`,
        );
      }
    } else {
      log.info("Did not detect any tokens requiring liquidity");
    }
    callback();
  } catch (error) {
    callback(error);
  }
};
