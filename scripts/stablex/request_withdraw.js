const StablecoinConverter = artifacts.require("StablecoinConverter")
const zero_address = 0x0
const { getArgumentsHelper } = require("../script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <accountId> <tokenId> <withdrawAmount>")
    }
    const [accountId, tokenId, amount_arg] = arguments
    const amount = new web3.utils.BN(web3.utils.toWei(amount_arg))

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const withdrawer = accounts[accountId]

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }

    await instance.requestWithdraw(token_address, amount, { from: withdrawer })
    const claimable_at = await instance.getPendingWithdrawBatchNumber(withdrawer, token_address)

    console.log(`Withdraw Request successful. Can be claimed in batch ${claimable_at}`)
    callback()
  } catch (error) {
    callback(error)
  }
}