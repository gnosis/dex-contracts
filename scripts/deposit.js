const SnappAuction = artifacts.require("SnappAuction")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const getArgumentsHelper = require("./script_utilities.js")

const zero_address = 0x0

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <accountId> <tokenId> <depositAmount>")
    }
    const [accountId, tokenId, amount] = arguments
    
    const instance = await SnappAuction.deployed()
    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${accountId}`)
    }
  
    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }
  
    const token = await ERC20Mintable.at(token_address)
    const depositor_balance = (await token.balanceOf.call(depositor)).toNumber()
    if (depositor_balance < amount) {
      callback("Error: Depositor has insufficient balance.")
    }
  
    const tx = await instance.deposit(tokenId, amount, {from: depositor})
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()
  
    const deposit_hash = (await instance.deposits(slot)).shaHash
    console.log("Deposit successful: Slot %s - Index %s - Hash %s", slot, slot_index, deposit_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}