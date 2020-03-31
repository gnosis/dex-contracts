const BatchExchange = artifacts.require("BatchExchange")
const { sendTxAndGetReturnValue } = require("../test/utilities.js")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("sellToken", {
    describe: "Token to be sold",
  })
  .option("buyToken", {
    describe: "token to be bought",
  })
  .option("minBuy", {
    describe: "minimum amount to be bought (in 10**18 WEI of buyToken, e.g. 1 = 1ETH)",
  })
  .option("maxSell", {
    describe: "minimum amount to be sold (in 10**18 WEI of sellToken, e.g. 1 = 1ETH)",
  })
  .option("validFor", {
    describe: "the number of auctions for which this orders is valid",
  })
  .demand(["accountId", "sellToken", "buyToken", "minBuy", "maxSell", "validFor"])
  .help(false)
  .version(false).argv

module.exports = async (callback) => {
  try {
    const minBuy = web3.utils.toWei(String(argv.minBuy))
    const maxSell = web3.utils.toWei(String(argv.maxSell))

    const instance = await BatchExchange.deployed()
    const accounts = await web3.eth.getAccounts()
    const account = accounts[argv.accountId]

    const batch_index = (await instance.getCurrentBatchId.call()).toNumber()
    const valid_until = batch_index + parseInt(argv.validFor)

    const id = await sendTxAndGetReturnValue(instance.placeOrder, argv.buyToken, argv.sellToken, valid_until, minBuy, maxSell, {
      from: account,
    })

    console.log(
      `Placed Limit Sell Order successfully with ID ${id}. Valid from batch ${batch_index} until batch: ${valid_until}`
    )
    callback()
  } catch (error) {
    callback(error)
  }
}
