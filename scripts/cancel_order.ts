import { factory } from "../ConfigLog4";
const log = factory.getLogger("scripts.cancel_order");

const BatchExchange = artifacts.require("BatchExchange");
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("orderIds", {
    type: "string",
    describe: "Order IDs to be canceled",
    coerce: (str: string) => {
      return str.split(",").map((o) => parseInt(o));
    },
  })
  .demand(["accountId", "orderIds"])
  .help(false)
  .version(false).argv;

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const accounts = await web3.eth.getAccounts();
    log.info(`Using account ${accounts[argv.accountId]}`);
    const instance = await BatchExchange.deployed();
    await instance.cancelOrders(argv.orderIds, {
      from: accounts[argv.accountId],
    });
    log.info(`Successfully cancelled orders with ID ${argv.orderIds}`);
    callback();
  } catch (error) {
    callback(error);
  }
};
