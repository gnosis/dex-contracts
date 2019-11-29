const BatchExchange = artifacts.require("BatchExchange")

const { decodeAuctionElements } = require("../../test/utilities.js")

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    const auctionElementsEncoded = await instance.getEncodedAuctionElements.call()
    const auctionElementsDecoded = decodeAuctionElements(auctionElementsEncoded)

    console.log(auctionElementsDecoded)

    callback()
  } catch (error) {
    callback(error)
  }
}
