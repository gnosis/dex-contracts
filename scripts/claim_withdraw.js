const SnappBase = artifacts.require("SnappBase")
const zero_address = 0x0
const getArgumentsHelper = require("./script_utilities.js")

const { encodePacked_16_8_128 }  = require("../test/snapp_utils.js")
const {
  generateMerkleTree,
  toHex
} = require("../test/utilities.js")

// TODO - make this more general
const MongoClient = require("mongodb").MongoClient
const url = "mongodb://localhost:27017/"
const dbName = "test_db"

const withdraw_search = async function(db_name, _slot, valid=null, a_id=null, t_id=null) {
  const db = await MongoClient.connect(url)
  const collectionName = "withdraws"
  const dbo = db.db(db_name)
  const query = { 
    slot: parseInt(_slot)
  }
  if (a_id) query["accountId"] = parseInt(a_id)
  if (t_id) query["tokenId"] = parseInt(t_id)
  if (valid) query.valid = true

  console.log(`Querying ${collectionName} with`, query)
  const res = await dbo.collection(collectionName).find(query).toArray()
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

    // Verify account and token
    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${accountId}`)
    }
    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }

    // Verify slot has been processed
    const claimableState = await instance.claimableWithdraws(slot)
    if (claimableState.appliedAccountStateIndex == 0) {
      callback(`Error: Requested slot ${slot} not been processed!`)
    }

    const valid_withdrawals = await withdraw_search(dbName, slot, true, accountId, tokenId)
    if (!valid_withdrawals) {
      callback(`Error: No valid withdraw found in slot ${slot}`)
    }

    console.log("Reconstructing Merkle Tree from leaf nodes")
    const all_withdraws = await withdraw_search(dbName, slot)
    const withdraw_hashes = []
    all_withdraws.forEach(function (withdraw) {
      // TODO - no need to encode-pack zeroes (can use 0x0)
      let hash = encodePacked_16_8_128(0, 0, 0)
      if (withdraw.valid) {
        hash = encodePacked_16_8_128(withdraw.accountId, withdraw.tokenId, withdraw.amount)
      }
      withdraw_hashes.push(hash)
    })
    const tree = generateMerkleTree(withdraw_hashes)
    // Verify merkle roots agree
    if (claimableState.merkleRoot != toHex(tree.getRoot())) {
      callback(`Merkle Roots disagree: ${claimableState.merkleRoot} != ${toHex(tree.getRoot())}`)
    }

    const bitMap = claimableState.claimedBitmap
    for (let i = 0; i < valid_withdrawals.length; i++){
      const toClaim = valid_withdrawals[i]
      if (bitMap[i]) {
        console.log("Already claimed:", toClaim)
      } else {
        console.log("Attempting to claim:", toClaim)
        const leaf = encodePacked_16_8_128(accountId, tokenId, toClaim.amount)
        const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

        // Could also check if leaf if contained in withdraw_hashes
        if (!proof.length) {
          callback(`Proof for ${toClaim} not found [likely invalid]`)
        }
        await instance.claimWithdrawal(slot, toClaim.slotIndex, accountId, tokenId, toClaim.amount, proof)
        console.log("Success!")
      }
    }
    callback()
  } catch(error) {
    callback(error)
  }
}