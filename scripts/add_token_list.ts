import { promises as fs } from "fs";
import { factory } from "../src/logging";
import { addTokens, getBatchExchange, getOwl } from "./util";
import DefaultTokenList from "./data/tokenList.json";
const log = factory.getLogger("scripts.add_token_list");

const argv = require("yargs")
  .option("token_list", {
    describe:
      "A path to a token list, a default list will be used if not specified",
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
    let tokenList: TokenObject[];
    if (argv.token_list) {
      log.info(`Reading token list from '${argv.token_list}'`);
      const json = await fs.readFile(argv.token_list, "utf-8");
      tokenList = JSON.parse(json);
    } else {
      log.info("Using default token list");
      tokenList = DefaultTokenList as TokenObject[];
    }

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
