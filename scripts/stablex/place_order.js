const StablecoinConverter = artifacts.require("StablecoinConverter")
const { sendTxAndGetReturnValue } = require("../../test/utilities.js")
const argv = require("yargs").argv

module.exports = async (callback) => {
  try {
    if ([argv.accountId, argv.buyToken, argv.sellToken, argv.minBuy, argv.maxSell, argv.validFor].indexOf(undefined) != -1) {
      callback("Error: This script requires arguments: --accountId, --buyToken, --sellToken, --minBuy, --maxSell, --valid for")
    }
    const account = accounts[argv.accountId]
    const minBuy = web3.utils.toWei(String(argv.minBuy))
    const maxSell = web3.utils.toWei(String(argv.maxSell))

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()

    const batch_index = (await instance.getCurrentStateIndex.call()).toNumber()
    const valid_until = batch_index + parseInt(argv.validFor)

    const id = await sendTxAndGetReturnValue(instance.placeOrder, argv.buyToken, argv.sellToken, true, valid_until, minBuy, maxSell, { from: account })

    console.log(`Placed Limit Sell Order successfully with ID ${id}. Valid from batch ${batch_index} until batch: ${valid_until}`)
    callback()
  } catch (error) {
    callback(error)
  }
}