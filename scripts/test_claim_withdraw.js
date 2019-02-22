const deposit = require("./deposit")
const processDeposits = require("./apply_deposits")
const mineBlocks = require("./mine_blocks")
const requestWithdraw = require("./request_withdraw")
const processWithdrawals = require("./apply_withdrawals")
const claimWithdraw = require("./claim_withdraw")

const { encodePacked_16_8_128 }  = require("../test/snapp_utils.js")
const {
  generateMerkleTree,
  toHex
} = require("../test/utilities.js")

module.exports = async function(callback) {
  try {
    await deposit(1, 1, 1)
    await deposit(1, 2, 1)
    await mineBlocks(20)
    await processDeposits(0, 0x0, 0x0)
    await processDeposits(1, 0x0, 0x0)
    await requestWithdraw(1, 1, 1)
    await requestWithdraw(1, 2, 2)
    await mineBlocks(20)
    await processWithdrawals(0, 0x0, 0x0)
    // Generate correct merkle root
    const withdraw_hashes = [encodePacked_16_8_128(1, 1, 1), encodePacked_16_8_128(0, 0, 0)]
    const tree = generateMerkleTree(withdraw_hashes)
    const root = toHex(tree.getRoot())
    await processWithdrawals(1, root, 0x0)
    await claimWithdraw(1, 1, 1)

    // Shoudl fail
    await claimWithdraw(1, 1, 1)
    // Should also fail
    await claimWithdraw(1, 1, 2)
  } catch (error) {
    callback(error)
  }
}


