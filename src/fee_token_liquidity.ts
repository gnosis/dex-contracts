import BN from "bn.js";
import { BatchExchangeInstance } from "../types/truffle-typings";
import { factory } from "../ConfigLog4";

const log = factory.getLogger("fee_token_liquidity");

export interface TokenInfo {
  id: number;
  address: string;
  symbol?: string;
  decimals?: number;
}

const MAXU32 = new BN(2).pow(new BN(32)).sub(new BN(1));

/**
 * Used to recover relevant {@link TokenInfo | TokenInfo} by ID from the exchange such as number of decimals or name.
 * @param exchange - An instance of deployed Batch Exchange Contract
 * @param tokenIds - An array of token ids as listed on the Batch Exchange.
 * @param artifacts - A context-like object providing a gateway to Truffle contract ABIs.
 * @returns A mapping of TokenInfo objects fetched from the exchange.
 *   Note that Nullish TokenInfo objects are returned in places where the requested token ID failed to fetch.
 */
export async function fetchTokenInfoFromExchange(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  artifacts: Truffle.Artifacts,
): Promise<Map<number, TokenInfo>> {
  const ERC20 = artifacts.require("ERC20Detailed");
  // Fetching token data from EVM
  const tokenObjects: Map<number, TokenInfo> = new Map();
  for (const id of tokenIds) {
    const tokenAddress = await exchange.tokenIdToAddressMap(id);
    let tokenInfo;
    try {
      const tokenInstance = await ERC20.at(tokenAddress);
      const symbol = await tokenInstance.symbol();
      const decimals = (await tokenInstance.decimals()).toNumber();
      tokenInfo = {
        id: id,
        symbol: symbol,
        decimals: decimals,
        address: tokenAddress,
      };
      log.info(
        () =>
          `Found Token ${symbol} with ID ${id} at address ${tokenAddress} having ${decimals} decimals`,
      );
    } catch (err) {
      // This generic try-catch is essentially a TokenNotFoundError
      // Could occur when the given ID slot is not occupied by a registered token on the exhchange
      // or if the code registered at address occupied by a token slot is not that of and ERC20 token
      log.warn(() => `Token Not Found: ${id} - ${tokenAddress}`);
      tokenInfo = {
        id: id,
        address: tokenAddress,
      };
    }
    tokenObjects.set(id, tokenInfo);
  }
  return tokenObjects;
}

/**
 * A handy function providing fee token liquidity by placing orders selling the fee token
 * at the specified provision price for each specified token.
 * @param exchange - BatchExchange Smart Contract
 * @param tokenIds - An array of token indices as represented on the exchange
 * @param provisionPrice - Price at which liquidity is to be provided
 * @param sellAmountOwl - Amount of feeToken to be sold
 * @param artifacts - A context-like object providing a gateway to Truffle contract ABIs.
 * @returns Void Promise
 */
export async function placeFeeTokenLiquidityOrders(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  provisionPrice: BN,
  sellAmountOwl: BN,
  artifacts: Truffle.Artifacts,
): Promise<void> {
  const minBuyAmounts = [];
  const validTokenIds = [];
  const feeToken = await fetchTokenInfoFromExchange(exchange, [0], artifacts);
  // This is expected to always be OWL which has 18 digits.
  const feeDigits = feeToken.get(0)?.decimals || 18;
  const tokenInfo = await fetchTokenInfoFromExchange(
    exchange,
    tokenIds,
    artifacts,
  );
  for (const tokenId of tokenIds) {
    const numDigits = tokenInfo.get(tokenId)?.decimals;
    if (numDigits && numDigits != -1) {
      validTokenIds.push(tokenId);
      if (numDigits < feeDigits) {
        minBuyAmounts.push(
          sellAmountOwl
            .mul(provisionPrice)
            .div(new BN(10).pow(new BN(feeDigits - numDigits))),
        );
      } else {
        minBuyAmounts.push(
          sellAmountOwl
            .mul(provisionPrice)
            .mul(new BN(10).pow(new BN(numDigits - feeDigits))),
        );
      }
    }
  }
  const numOrders = validTokenIds.length;
  const batchId = (await exchange.getCurrentBatchId()).toNumber();
  if (numOrders == 0) {
    log.info(
      "No orders added since all tokens sufficiently funded or not found.",
    );
    return;
  }
  await exchange.placeValidFromOrders(
    validTokenIds, // buyTokens
    Array(numOrders).fill(0), // sellTokens
    Array(numOrders).fill(batchId + 2), // validFroms (all to begin 2 batches from now)
    Array(numOrders).fill(MAXU32), // validTos
    minBuyAmounts, // buyAmounts
    Array(numOrders).fill(sellAmountOwl), // sellAmount
  );
  log.info(
    "Placed fee token liquidity orders for the following tokens" +
      (await Promise.all(
        validTokenIds.map(async (i) => await tokenInfo.get(i)?.address),
      )),
  );
}
