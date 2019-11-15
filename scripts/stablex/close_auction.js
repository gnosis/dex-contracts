const { closeAuction } = require("./utilities.js")

module.exports = async (callback) => {
  try {
    const StablecoinConverter = artifacts.require("StablecoinConverter")
    const instance = await StablecoinConverter.deployed()
    await closeAuction(instance)
    console.log("Auction is closed")
    callback()
  } catch (error) {
    callback(error)
  }
}