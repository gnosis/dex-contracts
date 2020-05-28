import { addTokens, getBatchExchange, getOwl } from "./util";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.place_order");

const argv = require("yargs")
  .option("tokenAddress", {
    describe: "Address of the token to be added",
  })
  .demand(["tokenAddress"])
  .help(false)
  .version(false).argv;

module.exports = async function (callback: Truffle.ScriptCallback) {
  try {
    const [account] = await web3.eth.getAccounts();
    log.info(`Using account ${account}`);
    const batchExchange = await getBatchExchange(artifacts);
    const owl = await getOwl(artifacts);
    await addTokens([argv.tokenAddress], account, batchExchange, owl);
    callback();
  } catch (error) {
    callback(error);
  }
};
