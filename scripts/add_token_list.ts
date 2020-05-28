import { addTokens, getBatchExchange, getOwl } from "./util";
import fetch from "cross-fetch";
const argv = require("yargs")
  .option("token_list_url", {
    describe: "A url which can be fetched with cross-fetch",
    default:
      "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json",
  })
  .help(false)
  .version(false).argv;

module.exports = async function (callback: Truffle.ScriptCallback) {
  try {
    const tokenList = await (await fetch(argv.token_list_url)).json();
    const networkId = String(await web3.eth.net.getId());

    const tokenAddresses: string[] = [];
    for (const token in tokenList) {
      const network_address_map = new Map(
        Object.entries(tokenList[token].addressByNetwork),
      );
      const tokenAddress = network_address_map.get(networkId);
      if (tokenAddress) {
        tokenAddresses.push(tokenAddress);
      }
    }
    const [account] = await web3.eth.getAccounts();
    const batchExchange = await getBatchExchange(artifacts);
    const owl = await getOwl(artifacts);

    await addTokens(tokenAddresses, account, batchExchange, owl);

    callback();
  } catch (error) {
    callback(error);
  }
};
