const SnappAuction = artifacts.require("SnappAuction")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const { setupEnvironment } = require("../../test/utilities.js")
const argv = require("yargs")
  .option("numAccounts", {
    describe: "Number of accounts to register with exchange",
    default: 3,
  })
  .option("numTokens", {
    describe: "Number of tokens to create, fund and add to exchange",
    default: 3,
  })
  .help()
  .version(false).argv

module.exports = async function (callback) {
  try {
    const instance = await SnappAuction.deployed()
    const accounts = await web3.eth.getAccounts()
    const token_owner = accounts[1]

    console.log(`Beginning environment setup with ${argv.numAccounts} accounts and ${argv.numTokens} tokens`)
    await setupEnvironment(ERC20Mintable, instance, token_owner, accounts.slice(0, argv.numAccounts), argv.numTokens, true)
    console.log("Environment setup complete")

    callback()
  } catch (error) {
    callback(error)
  }
}
