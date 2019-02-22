const deposit = require("./deposit")
const processDeposits = require("./apply_deposits")
const mineBlocks = require("./mine_blocks")
const requestWithdraw = require("./request_withdraw")
const processWithdrawals = require("./apply_withdrawals")
// const claimWithdraw = require("./claim_withdraw")


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
  } catch (error) {
    callback(error)
  }
}


