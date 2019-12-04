const SnappAuction = artifacts.require("SnappAuction")
const ERC20 = artifacts.require("ERC20")
const argv = require("yargs")
  .option("accountId", {
    describe: "Claimer's account index",
  })
  .option("tokenId", {
    describe: "Token to claim",
  })
  .option("slot", {
    describe: "The slot in which the to be claimed withdraw was requested",
  })
  .demand(["accountId", "tokenId", "slot"])
  .help(false)
  .version(false).argv

const zero_address = 0x0

// Merkle Requirements
const { sha256 } = require("ethereumjs-util")
const { encodePacked_16_8_128 } = require("../../test/snapp/snapp_utils.js")
const { MerkleTree } = require("merkletreejs")
const { toHex } = require("../../test/utilities.js")

const axios = require("axios")
const url = process.env.GRAPH_URL || "http://localhost:8000/subgraphs/name/dfusion"

const withdraw_search = async function(_slot, valid = null, a_id = null, t_id = null) {
  let where_clause = `slot: ${_slot} `
  if (a_id)
    where_clause += `accountId: "${parseInt(a_id)
      .toString(16)
      .padStart(40, "0")}" `
  if (t_id) where_clause += `tokenId: ${parseInt(t_id)} `
  if (valid) where_clause += `valid: ${valid}`

  const response = await axios.post(url, {
    query: `query {
              withdraws(where: { ${where_clause} }) {
                id, accountId, tokenId, amount, slot, slotIndex, valid
              }
            }`,
  })
  // GraphQL returns "bad" json in that keys are not surrounded by quotes ({"data": {}" vs {data: {}}).
  // Therefore JSON.parse() fails, since this is only used in tests, using eval should be ok
  return eval(response.data).data.withdraws
}

module.exports = async callback => {
  try {
    const instance = await SnappAuction.deployed()

    // Verify account and token
    const depositor = await instance.accountToPublicKeyMap.call(argv.accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${argv.accountId}`)
    }
    const token_address = await instance.tokenIdToAddressMap.call(argv.tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`)
    }

    if (await instance.isPendingWithdrawActive(argv.slot)) {
      callback(`Error: Requested slot ${argv.slot} not been processed!`)
    }

    const valid_withdrawals = await withdraw_search(argv.slot, true, argv.accountId, argv.tokenId)
    console.log(valid_withdrawals)
    if (valid_withdrawals.length == 0) {
      callback(`Error: No valid withdraw found in slot ${argv.slot}`)
    }

    console.log("Reconstructing Merkle Tree from leaf nodes")
    const all_withdraws = await withdraw_search(argv.slot)
    const withdraw_hashes = Array(2 ** 7).fill(Buffer.alloc(32))
    for (let i = 0; i < all_withdraws.length; i++) {
      const withdraw = all_withdraws[i]
      if (withdraw.valid) {
        withdraw_hashes[i] = encodePacked_16_8_128(parseInt(withdraw.accountId, 16), withdraw.tokenId, parseInt(withdraw.amount))
      }
    }
    const tree = new MerkleTree(withdraw_hashes, sha256)
    const claimable_root = await instance.getClaimableWithdrawHash(argv.slot)
    // Verify merkle roots agree
    if (claimable_root != toHex(tree.getRoot())) {
      callback(`Merkle Roots disagree: ${claimable_root} != ${toHex(tree.getRoot())}`)
    }

    for (let i = 0; i < valid_withdrawals.length; i++) {
      const toClaim = valid_withdrawals[i]
      if (await instance.hasWithdrawBeenClaimed.call(argv.slot, toClaim.slotIndex)) {
        console.log("Already claimed:", toClaim)
      } else {
        console.log("Attempting to claim:", toClaim)
        const leaf = encodePacked_16_8_128(argv.accountId, argv.tokenId, parseInt(toClaim.amount))
        const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

        // Could also check if leaf if contained in withdraw_hashes
        if (!proof.length) {
          callback("Proof not found [likely invalid]")
        }

        const token = await ERC20.at(token_address)
        const balance_before = await token.balanceOf(depositor)

        await instance.claimWithdrawal(argv.slot, toClaim.slotIndex, argv.accountId, argv.tokenId, toClaim.amount, proof)

        const balance_after = await token.balanceOf(depositor)
        console.log(`Success! Balance of token ${argv.tokenId} before claim: ${balance_before}, after claim: ${balance_after}`)
      }
    }
    callback()
  } catch (error) {
    callback(error)
  }
}
