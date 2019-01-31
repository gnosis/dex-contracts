const { waitForNBlocks } = require("../test/utilities.js")
module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <number of blocks>")
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