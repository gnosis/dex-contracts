import { addTokens, getBatchExchange, getOwl } from "./util";
import fetch from "cross-fetch";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.add_token_list");

const argv = require("yargs")
  .option("token_list_url", {
    describe: "A url which can be fetched with cross-fetch",
    default:
      "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json",
  })
  .help(false)
  .version(false).argv;

interface TokenObject {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  addressByNetwork: Record<string, string | undefined>;
  website?: string;
  description?: string;
  rinkeby_faucet?: string;
}

module.exports = async function (callback: Truffle.ScriptCallback) {
  try {
    const tokenList: TokenObject[] = await (
      await fetch(argv.token_list_url)
    ).json();
    const networkId = String(await web3.eth.net.getId());
    const tokenAddresses = [];
    for (const token of tokenList) {
      const address = token.addressByNetwork[networkId];
      if (address) {
        tokenAddresses.push(address);
      }
    }

    const [account] = await web3.eth.getAccounts();
    const batchExchange = await getBatchExchange(artifacts);
    const owl = await getOwl(artifacts);
    log.info(`Attempting to register ${tokenAddresses.length} tokens`);
    await addTokens(tokenAddresses, account, batchExchange, owl);

    callback();
  } catch (error) {
    callback(error);
  }
};
