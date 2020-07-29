import BN from "bn.js";
import { factory } from "../src/logging";

const log = factory.getLogger("scripts.submitSolution");
const BatchExchange = artifacts.require("BatchExchange");

const argv = require("yargs")
  .option("resultFile", {
    describe: "The path to the solver's solution file",
  })
  .demand(["resultFile"])
  .help(false)
  .version(false).argv;

type TokenId = string;

interface SettledOrder {
  accountID: string;
  orderID: number;
  execBuyAmount: string;
}

interface Result {
  prices: Record<TokenId, string>;
  orders: [SettledOrder];
}

// Turns T00x to x
const tokenID = (t: string) => parseInt(t.slice(1));

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const instance = await BatchExchange.deployed();
    const batchId = (await instance.getCurrentBatchId()).subn(1);
    const result: Result = require(argv.resultFile);

    // Extract traded amounts
    const owners: string[] = [];
    const orderIds: BN[] = [];
    const buyVolumes: BN[] = [];
    result.orders.forEach((order) => {
      owners.push(order.accountID);
      orderIds.push(new BN(order.orderID));
      buyVolumes.push(new BN(order.execBuyAmount));
    });

    //Extract prices
    const prices: BN[] = [];
    const tokenIdsForPrice: number[] = [];
    for (const token in result.prices) {
      const id = tokenID(token);
      if (id == 0) {
        continue;
      }
      prices.push(new BN(result.prices[token]));
      tokenIdsForPrice.push(id);
    }

    // Cannot be U256::max because the SC would otherwise overflow
    const objectiveValue = new BN(2).shln(248).subn(1);

    log.info(`Submitting solution for batch ${batchId} with args:
      objective: ${objectiveValue}
      owners: [${owners}]
      orderIds: [${orderIds}]
      buyVolumes: [${buyVolumes}]
      prices: [${prices}]
      tokenIdsForPrice: [${tokenIdsForPrice}]
    `);

    await instance.submitSolution(
      batchId,
      objectiveValue,
      owners,
      orderIds,
      buyVolumes,
      prices,
      tokenIdsForPrice,
    );
  } catch (error) {
    callback(error);
  }
};
