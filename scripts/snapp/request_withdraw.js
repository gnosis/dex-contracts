const SnappAuction = artifacts.require("SnappAuction")
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

    const instance = await SnappAuction.deployed()
    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${accountId}`)
    }

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }

    const tx = await instance.requestWithdrawal(tokenId, amount, { from: depositor })
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()

    const withdraw_hash = (await instance.getWithdrawHash(slot))
    console.log("Withdraw Request successful: Slot %s - Index %s - Hash %s", slot, slot_index, withdraw_hash)
    callback()
  } catch (error) {
    callback(error)
  }
}