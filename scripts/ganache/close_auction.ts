import { closeAuction } from "../../test/utilities";
import { factory } from "../../src/logging";
const log = factory.getLogger("scripts.close_auction");

// Note that this script only works in local blockchains
module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const BatchExchange = artifacts.require("BatchExchange");
    const instance = await BatchExchange.deployed();
    await closeAuction(instance, web3);
    log.info("Auction closed");
    callback();
  } catch (error) {
    callback(error);
  }
};
