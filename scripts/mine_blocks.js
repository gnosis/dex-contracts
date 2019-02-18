const { waitForNBlocks } = require("../test/utilities.js")
const getArgumentsHelper = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <numberOfBlocks>")
    }
    const [times] = arguments
    const accounts = await web3.eth.getAccounts()
    await waitForNBlocks(times, accounts[0], web3)
    console.log("mined", times, "blocks")
    callback()
  } catch(error) {
    callback(error)
  }
}