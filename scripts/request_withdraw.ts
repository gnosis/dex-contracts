import { factory } from "../ConfigLog4";
const log = factory.getLogger("scripts.request_withdraw");

const BatchExchange = artifacts.require("BatchExchange");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const argv = require("yargs")
  .option("accountId", {
    describe: "Withdrawers's account index",
  })
  .option("tokenId", {
    describe: "Token to withdraw",
  })
  .option("amount", {
    describe: "Amount in to withdraw (in 10**18 WEI, e.g. 1 = 1 ETH)",
  })
  .demand(["accountId", "tokenId", "amount"])
  .help(false)
  .version(false).argv;

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const amount = web3.utils.toWei(String(argv.amount));

    const instance = await BatchExchange.deployed();
    const accounts = await web3.eth.getAccounts();
    const withdrawer = accounts[argv.accountId];
    log.info(`Using account ${withdrawer}`);

    const token_address = await instance.tokenIdToAddressMap(argv.tokenId);
    if (token_address === ZERO_ADDRESS) {
      callback(`Error: No token registered at index ${argv.tokenId}`);
    }

    await instance.requestWithdraw(token_address, amount, { from: withdrawer });
    const claimable_at = (
      await instance.getPendingWithdraw(withdrawer, token_address)
    )[1];

    console.log(
      `Withdraw request successful. Will be claimable in batch ${claimable_at}`,
    );
    callback();
  } catch (error) {
    callback(error);
  }
};
