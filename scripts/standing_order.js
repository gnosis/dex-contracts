const BN = require("bn.js")
const SnappAuction = artifacts.require("SnappAuction")
const {
  getArgumentsHelper,
  getOrderData
} = require("./script_utilities.js")
const { encodeOrder } = require("../test/snapp_utils.js")

module.exports = async (callback) => {
  try {
    const instance = await SnappAuction.deployed()
    const accountId = getArgumentsHelper()[0]
    if (accountId >= await instance.AUCTION_RESERVED_ACCOUNTS()) {
      callback(`Error: Account is not eligible for ${accountId} standing orders`)
    }

    const [buyToken, sellToken, minBuy, maxSell, sender] = await getOrderData(instance, callback, web3)

    const packedOrder = encodeOrder(
      new BN(buyToken, 10), new BN(sellToken, 10), new BN(minBuy, 10), new BN(maxSell, 10)
    )
    const tx = await instance.placeStandingSellOrder(packedOrder, { from: sender })
    const batch_index = tx.logs[0].args.currentBatchIndex.toNumber()
  
    const order_hash = (await instance.getStandingOrderHash(accountId, batch_index))
    console.log("Standing Sell Order placed: BatchIndex %s - Hash %s", batch_index, order_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}
