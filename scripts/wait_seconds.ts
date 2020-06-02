import { waitForNSeconds } from "..//test/utilities";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.wait_seconds");

const argv = require("yargs")
  .option("seconds", {
    describe: "Number of seconds to wait",
    type: "int",
    demandOption: true,
  })
  .help(false)
  .version(false).argv;

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    await waitForNSeconds(argv.seconds, web3);
    log.info(`waited ${argv.seconds} seconds`);
    callback();
  } catch (error) {
    callback(error);
  }
};
