const SnappAuction = artifacts.require("SnappAuction")
const {
  getOrderData,
  getArgumentsHelper
} = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const instance = await SnappAuction.deployed()
    const accountId = getArgumentsHelper()[0]
    if (accountId >= await instance.AUCTION_RESERVED_ACCOUNTS()) {
      callback(`Error: Account is not eligible for ${accountId} standing orders`)
    }

    const [buyToken, sellToken, minBuy, maxSell, sender] = getOrderData(instance, callback)

    const tx = await instance.placeStandingSellOrder(buyToken, sellToken, minBuy, maxSell, { from: sender })
    const auction_id = tx.logs[0].args.auctionId.toNumber()
    const batch_index = tx.logs[0].args.currentBatchIndex.toNumber()
  
    const order_hash = (await instance.getStandingOrderHash(accountId, batch_index))
    console.log("Standing Sell Order placed: Auction %s - BatchIndex %s - Hash %s", auction_id, batch_index, order_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}