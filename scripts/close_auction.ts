import { closeAuction } from "../test/utilities";
import { factory } from "../ConfigLog4";
const log = factory.getLogger("scripts.close_auction");

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    if (argv.network && argv.network != "development") {
      log.warn(
        "Note that this script can only be used with a local blockchain",
      );
    }
    const BatchExchange = artifacts.require("BatchExchange");
    const instance = await BatchExchange.deployed();
    await closeAuction(instance, web3);
    log.info("Auction closed");
    callback();
  } catch (error) {
    callback(error);
  }
};
