const SnappAuction = artifacts.require("SnappAuction")
const argv = require("yargs").argv

module.exports = async (callback) => {
  try {
    if (!argv.slot || !argv.merkleRoot || !argv.newStateRoot) {
      callback("Error: This script requires arguments: --slot, --merkleRoot, --newStateRoot")
    }

    const instance = await SnappAuction.deployed()

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    if (await instance.hasWithdrawBeenApplied(argv.slot)) {
      callback("Error: Requested withdraw slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", argv.slot, curr_state, argv.newState)
    const withdraw_hash = await instance.getWithdrawHash(argv.slot)
    await instance.applyWithdrawals(argv.slot, argv.merkleRoot, curr_state, argv.newState, withdraw_hash)
    console.log("Successfully applied Withdrawals!")
    callback()
  } catch (error) {
    callback(error)
  }
}
