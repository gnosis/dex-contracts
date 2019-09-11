const StablecoinConverter = artifacts.require("StablecoinConverter")
const zero_address = 0x0
const argv = require("yargs").argv

module.exports = async (callback) => {
  try {
    if (!argv.accountId || !argv.tokenId || !argv.amount) {
      callback("Error: This script requires arguments: --accountId, --tokenId, --amount")
    }

    const amount = web3.utils.toWei(new web3.utils.BN(argv.amount))

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const withdrawer = accounts[argv.accountId]

    const token_address = await instance.tokenIdToAddressMap.call(argv.tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`)
    }

    await instance.requestWithdraw(token_address, amount, { from: withdrawer })
    const claimable_at = await instance.getPendingWithdrawBatchNumber(withdrawer, token_address)

    console.log(`Withdraw Request successful. Can be claimed in batch ${claimable_at}`)
    callback()
  } catch (error) {
    callback(error)
  }
}