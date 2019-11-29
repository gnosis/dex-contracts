const SnappAuction = artifacts.require("SnappAuction")
const { getOrderData } = require("../script_utilities.js")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer"
  })
  .option("sellToken", {
    describe: "Token to be sold"
  })
  .option("buyToken", {
    describe: "token to be bought"
  })
  .option("minBuy", {
    describe: "minimum amount to be bought (in 10**18 WEI of buyToken, e.g. 1 = 1ETH)"
  })
  .option("maxSell", {
    describe: "minimum amount to be sold (in 10**18 WEI of sellToken, e.g. 1 = 1ETH)"
  })
  .demand(["accountId", "sellToken", "buyToken", "minBuy", "maxSell"])
  .help(false)
  .version(false).argv

module.exports = async callback => {
  try {
    const instance = await SnappAuction.deployed()
    const [buyToken, sellToken, minBuy, maxSell, sender] = await getOrderData(instance, callback, web3, argv)

    const tx = await instance.placeSellOrder(buyToken, sellToken, minBuy, maxSell, { from: sender })
    const auction_id = tx.logs[0].args.auctionId.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()

    const order_hash = (await instance.auctions(auction_id)).shaHash
    console.log("Limit Sell Order successful: Auction %s - Index %s - Hash %s", auction_id, slot_index, order_hash)
    callback()
  } catch (error) {
    callback(error)
  }
}
