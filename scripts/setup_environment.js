const SnappAuction = artifacts.require("SnappAuction")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const getArgumentsHelper = require("./script_utilities.js")
const { setupEnvironment } = require("../test/utilities.js")

module.exports = async function(callback) {
  try {

    const arguments = getArgumentsHelper()
    const [numAccounts] = arguments || 3
    const instance = await SnappAuction.deployed()
    const accounts = await web3.eth.getAccounts()
    const token_owner = accounts[1]
    await setupEnvironment(ERC20Mintable, instance, token_owner, accounts, numAccounts)
    console.log("Environment setup complete")
    callback()
  } catch (error) {
    callback(error)
  }
}
