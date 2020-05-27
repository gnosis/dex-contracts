const BatchExchange = artifacts.require("BatchExchange");
const ERC20 = artifacts.require("ERC20.sol");
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

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const amount = web3.utils.toWei(String(argv.amount));
    const instance = await BatchExchange.deployed();
    const accounts = await web3.eth.getAccounts();
    const depositor = await accounts[argv.accountId];

    const token_address = await instance.tokenIdToAddressMap(argv.tokenId);
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`);
    }

    const token = await ERC20.at(token_address);
    const depositor_balance = await token.balanceOf.call(depositor);
    if (depositor_balance.lt(amount)) {
      callback(
        `Error: Depositor has insufficient balance ${depositor_balance} < ${amount}.`,
      );
    }

    const allowance = (
      await token.allowance.call(depositor, instance.address)
    ).toString();
    if (allowance < amount) {
      await token.approve(instance.address, amount, { from: depositor });
    }

    await instance.deposit(token_address, amount, { from: depositor });
    const tradeable_at = (
      await instance.getPendingDeposit(depositor, token_address)
    )[1];

    console.log(
      `Deposit successful. Can be traded as of batch ${tradeable_at}`,
    );
    callback();
  } catch (error) {
    callback(error);
  }
};
