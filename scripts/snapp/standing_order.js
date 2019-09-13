const BN = require("bn.js")
const SnappAuction = artifacts.require("SnappAuction")
const {
  getOrderData
} = require("../script_utilities.js")
const { encodeOrder } = require("../../test/snapp_utils.js")
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
  .version(false)
  .argv

module.exports = async (callback) => {
  try {
    const instance = await SnappAuction.deployed()
    const accountId = argv.accountId
    if (accountId >= await instance.AUCTION_RESERVED_ACCOUNTS()) {
      callback(`Error: Account is not eligible for ${accountId} standing orders`)
    }

    const [buyToken, sellToken, minBuy, maxSell, sender] = await getOrderData(instance, callback, web3, argv)

    const packedOrder = encodeOrder(
      new BN(buyToken, 10), new BN(sellToken, 10), new BN(minBuy, 10), new BN(maxSell, 10)
    )
    const tx = await instance.placeStandingSellOrder(packedOrder, { from: sender })
    const batch_index = tx.logs[0].args.currentBatchIndex.toNumber()

    const order_hash = (await instance.getStandingOrderHash(accountId, batch_index))
    console.log("Standing Sell Order placed: BatchIndex %s - Hash %s", batch_index, order_hash)
    callback()
  } catch (error) {
    callback(error)
  }
}
