const { closeAuction } = require("./utilities.js")

module.exports = async callback => {
  try {
    const BatchExchange = artifacts.require("BatchExchange")
    const instance = await BatchExchange.deployed()
    await closeAuction(instance, web3)
    console.log("Auction closed")
    callback()
  } catch (error) {
    callback(error)
  }
}
