import BN from "bn.js";
import { factory } from "../src/logging";
const BatchExchange = artifacts.require("BatchExchange");
const ERC20 = artifacts.require("ERC20");
const argv = require("yargs")
  .option("accountId", {
    describe: "Depositor's account index",
  })
  .option("tokenId", {
    describe: "Token to deposit",
  })
  .option("amount", {
    describe: "Amount in to deposit (in 10**18 WEI, e.g. 1 = 1 ETH)",
  })
  .demand(["accountId", "tokenId", "amount"])
  .help(false)
  .version(false).argv;

const zero_address = "0x0000000000000000000000000000000000000000";
const log = factory.getLogger("deposit");

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    // Is is possible that this does not account for token.decimals?
    const amount = new BN(web3.utils.toWei(String(argv.amount)));
    const instance = await BatchExchange.deployed();
    const accounts = await web3.eth.getAccounts();
    const depositor = await accounts[argv.accountId];
    log.info(`Using account ${depositor}`);
    const token_address = await instance.tokenIdToAddressMap(argv.tokenId);
    if (token_address === zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`);
    }
    const token = await ERC20.at(token_address);
    const depositorBalance = await token.balanceOf(depositor);
    if (depositorBalance.lt(amount)) {
      callback(
        `Error: Insufficient balance (${depositorBalance.toString()} < ${amount.toString()}).`,
      );
    }

    const allowance = await token.allowance(depositor, instance.address);
    if (allowance.lt(amount)) {
      log.info(
        `Submitting approval for amount ${amount.sub(allowance).toString()}`,
      );
      await token.approve(instance.address, amount.sub(allowance), {
        from: depositor,
      });
    }

    await instance.deposit(token_address, amount, { from: depositor });
    const tradeable_at = (
      await instance.getPendingDeposit(depositor, token_address)
    )[1];
    log.info(`Deposit successful! Can be traded as of batch ${tradeable_at}`);
    callback();
  } catch (error) {
    callback(error);
  }
};
