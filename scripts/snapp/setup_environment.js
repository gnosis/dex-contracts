const SnappAuction = artifacts.require("SnappAuction")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const { getArgumentsHelper } = require("../script_utilities.js")
const { setupEnvironment } = require("../../test/utilities.js")

module.exports = async function (callback) {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length > 2) {
      callback("Error: This script accepts optional arguments - <numAccounts=3> <numTokens=3>")
    }
    const numAccounts = arguments[0] || 3
    const numTokens = arguments[1] || 3
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
