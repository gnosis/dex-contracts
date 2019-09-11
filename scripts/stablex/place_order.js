const StablecoinConverter = artifacts.require("StablecoinConverter")
const { getArgumentsHelper } = require("../script_utilities.js")
const { sendTxAndGetReturnValue } = require("../../test/utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 6) {
      callback("Error: This script requires arguments - <accountId> <buyToken> <sellToken> <minBuy> <maxSell> <valid for>")
    }
    const [accountId, buyToken, sellToken, minBuyArg, maxSellArg, validForString] = arguments
    const minBuy = web3.utils.toWei(minBuyArg)
    const maxSell = web3.utils.toWei(maxSellArg)

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()

    const batch_index = (await instance.getCurrentStateIndex.call()).toNumber()
    const valid_until = batch_index + parseInt(validForString)

    const id = await sendTxAndGetReturnValue(instance.placeOrder, buyToken, sellToken, true, valid_until, minBuy, maxSell, { from: accounts[accountId] })

    console.log(`Placed Limit Sell Order successfully with ID ${id}. Valid from batch ${batch_index} until batch: ${valid_until}`)
    callback()
  } catch (error) {
    callback(error)
  }
}