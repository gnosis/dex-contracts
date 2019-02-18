const SnappBase = artifacts.require("SnappBase")
const zero_address = 0x0

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <accountId> <tokenId> <withdraw amount>")
    }
    const [accountId, tokenId, amount] = arguments
    
    const instance = await SnappBase.deployed()
    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${accountId}`)
    }
  
    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }
  
    const tx = await instance.requestWithdrawal(tokenId, amount, {from: depositor})
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()
  
    const withdraw_hash = (await instance.pendingWithdraws(slot)).shaHash
    console.log("Withdraw Request successful: Slot %s - Index %s - Hash %s", slot, slot_index, withdraw_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}