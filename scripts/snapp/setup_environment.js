const SnappAuction = artifacts.require("SnappAuction")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const { setupEnvironment } = require("../../test/utilities.js")
const argv = require("yargs").argv

module.exports = async function (callback) {
  try {
    const numAccounts = argv.numAccounts || 3
    const numTokens = argv.numTokens || 3

    const instance = await SnappAuction.deployed()
    const accounts = await web3.eth.getAccounts()
    const token_owner = accounts[1]

    console.log(`Beginning environment setup with ${numAccounts} accounts and ${numTokens} tokens`)
    await setupEnvironment(ERC20Mintable, instance, token_owner, accounts.slice(0, numAccounts), numTokens, true)
    console.log("Environment setup complete")

    callback()
  } catch (error) {
    callback(error)
  }
}
