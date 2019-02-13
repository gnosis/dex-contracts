const { waitForNBlocks } = require("../test/utilities.js")
module.exports = async (callback) => {
  try {
    let sliceBy = 4
    if(process.argv.length == 7) {
      sliceBy = 6
    }
    const arguments = await process.argv.slice(sliceBy)
    if (arguments.length < 1) {
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