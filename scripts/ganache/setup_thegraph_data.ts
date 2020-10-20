import { toETH } from "../../test/resources/math";
import {
  solutionSubmissionParams,
  basicTrade,
} from "../../test/resources/examples";
import {
  makeDeposits,
  placeOrders,
  closeAuction,
  waitForNSeconds,
} from "../../test/utilities";
import {
  addTokens,
  getBatchExchange,
  getOwl,
  setAllowances,
  deleteOrders,
  submitSolution,
  getBatchId,
  createMintableToken,
  mintTokens,
  mintOwl,
} from "../util";

import { factory } from "../../src/logging";
const log = factory.getLogger("scripts.setup_thegraph");

module.exports = async function (callback: Truffle.ScriptCallback) {
  try {
    const exchange = await getBatchExchange(artifacts);
    const owl = await getOwl(artifacts);
    log.info(`OWL address ${owl.address}`);

    // Prepare user accounts
    const [user1Address, user2Address] = await web3.eth.getAccounts();
    const userAddresses = [user1Address, user2Address];
    const solverAddress = user2Address;
    const minter = user1Address;

    // Get current batch id
    let batchId = await getBatchId(exchange);
    log.info(`Current batchId: ${batchId}`);

    // Set user1 as minter of OWL
    await owl.setMinter(minter);

    // Mint OWL for every user
    const amount = web3.utils.toWei("3000");
    await mintOwl(owl, userAddresses, amount, minter);

    // Create 1 token
    const token1Instance = await createMintableToken(artifacts);
    const tokensInstances = [token1Instance];

    // Set allowances for OWL and the tokens
    await setAllowances(userAddresses, amount, exchange, [owl]);
    await setAllowances(userAddresses, amount, exchange, tokensInstances);

    // List the tokens in the exchange
    const tokenAddresses = [token1Instance.address];
    const [token1] = await addTokens(
      tokenAddresses,
      user1Address,
      exchange,
      owl,
    );

    // Mint tokens for all users
    await mintTokens(tokensInstances, userAddresses, amount, minter);

    // Make deposits, place orders and close auction [aka runAuctionScenario(basicTrade)]
    await makeDeposits(exchange, userAddresses, basicTrade.deposits);

    // Place orders
    let orderIds = await placeOrders(
      exchange,
      userAddresses,
      basicTrade.orders,
      batchId + 1,
    );

    // Request withdraw
    log.info(
      `Request withdraw for user ${user1Address}, token ${token1.address} (${token1.id})`,
    );
    await exchange.requestWithdraw(token1.address, 5, {
      from: user1Address,
    });

    // Close the auction
    log.info("Closing auction so we can withdraw the tokens");
    await closeAuction(exchange, web3);

    // Withdraw tokens
    log.info(
      `Withdraw for user ${user1Address}, token ${token1.address} (${token1.id})`,
    );
    await exchange.withdraw(user1Address, token1.address, {
      from: user1Address,
    });

    // Submit suboptimal solution
    await submitSolution(
      "Partial solution",
      batchId,
      solutionSubmissionParams(
        basicTrade.solutions[1],
        userAddresses,
        orderIds,
      ),
      solverAddress,
      exchange,
    );

    // Submit optimal solution
    await submitSolution(
      "Full solution",
      batchId,
      solutionSubmissionParams(
        basicTrade.solutions[0],
        userAddresses,
        orderIds,
      ),
      solverAddress,
      exchange,
    );

    // Close auction
    log.info("Close auction after solution has been applied");
    await closeAuction(exchange, web3);

    // Cancel the 2 orders
    log.info("Cancel the two orders");
    await deleteOrders(orderIds, userAddresses, exchange);

    // Create a new order with validity only for next batch
    batchId = await getBatchId(exchange);
    const newOrder = {
      sellToken: 0,
      buyToken: token1.id,
      sellAmount: toETH(10),
      buyAmount: toETH(10),
      user: 0,
    };
    log.info(`Place new order: ${JSON.stringify(newOrder)}`);
    orderIds = await placeOrders(
      exchange,
      [user1Address],
      [newOrder],
      batchId + 1,
    );
    log.info(`Placed order with id: ${orderIds.toString()}`);

    // Advance time (30min)
    log.info("Advance time 30min to make sure the new order expires");
    await waitForNSeconds(1800, web3);

    // Delete the new order
    await deleteOrders(orderIds, [user1Address], exchange);

    log.info(
      `Environment setup complete for BatchExchange with address ${exchange.address}`,
    );
    callback();
  } catch (error) {
    callback(error);
  }
};
