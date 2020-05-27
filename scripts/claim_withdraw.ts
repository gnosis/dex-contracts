import { factory } from "../ConfigLog4";
const log = factory.getLogger("scripts.claim_withdraw");

const BatchExchange = artifacts.require("BatchExchange");
const ERC20 = artifacts.require("ERC20");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const argv = require("yargs")
  .option("accountId", {
    describe: "Claimer's account index",
  })
  .option("tokenId", {
    describe: "Token to claim",
  })
  .demand(["accountId", "tokenId"])
  .help(false)
  .version(false).argv;

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const instance = await BatchExchange.deployed();
    const accounts = await web3.eth.getAccounts();
    const withdrawer = accounts[argv.accountId];
    log.info(`Using account ${withdrawer}`);

    const token_address = await instance.tokenIdToAddressMap(argv.tokenId);
    if (token_address === ZERO_ADDRESS) {
      callback(`Error: No token registered at index ${argv.tokenId}`);
    }
    const token = await ERC20.at(token_address);

    const balance_before = await token.balanceOf(withdrawer);
    await instance.withdraw(withdrawer, token_address, { from: withdrawer });
    const balance_after = await token.balanceOf(withdrawer);

    log.info(
      `Success! Balance of token ${argv.tokenId} before claim: ${balance_before}, after claim: ${balance_after}`,
    );
    callback();
  } catch (error) {
    callback(error);
  }
};
