const SnappBase = artifacts.require("SnappBase")
const zero_address = 0x0
const getArgumentsHelper = require("./script_utilities.js")

const MongoClient = require("mongodb").MongoClient
const url = "mongodb://localhost:27017/"

const withdraw_search = async function(db_name, _slot, a_id, t_id) {
  const db = await MongoClient.connect(url)
  const dbo = db.db(db_name)
  const query = { 
    slot: parseInt(_slot),
    accountId: parseInt(a_id),
    tokenId: parseInt(t_id),
  }
  
  const res = await dbo.collection("withdraws").find(query).toArray()
  db.close()
  return res
}


module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <slot> <accountId> <tokenId>")
    }
    const [slot, accountId, tokenId] = arguments
    
    const instance = await SnappBase.deployed()
    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${accountId}`)
    }

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }

    const valid_withdrawals = await withdraw_search("test_db", "deposits", slot, accountId, tokenId)
    console.log("Search Results:", valid_withdrawals)

    // const claimable_state = await instance.claimableWithdraws(slot)
    // console.log(claimable_state)
    // const withdraw_hash = (await instance.pendingWithdraws(slot)).shaHash
    // console.log("Withdraw Request successful: Slot %s - Index %s - Hash %s", slot, slot_index, withdraw_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}