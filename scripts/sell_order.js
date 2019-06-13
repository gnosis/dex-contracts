const SnappAuction = artifacts.require("SnappAuction")
const {
  getOrderData
} = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const instance = await SnappAuction.deployed()
    const [buyToken, sellToken, minBuy, maxSell, sender] = getOrderData(instance, callback)
  
    const tx = await instance.placeSellOrder(buyToken, sellToken, minBuy, maxSell, { from: sender })
    const auction_id = tx.logs[0].args.auctionId.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()
  
    const order_hash = (await instance.auctions(auction_id)).shaHash
    console.log("Limit Sell Order successful: Auction %s - Index %s - Hash %s", auction_id, slot_index, order_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}