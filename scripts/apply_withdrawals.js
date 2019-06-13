const SnappAuction = artifacts.require("SnappAuction")
const getArgumentsHelper = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <slot> <merkleRoot> <newStateRoot>")
    }
    const [slot, merkle_root, new_state] = arguments
    
    const instance = await SnappAuction.deployed()

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    if (await instance.hasWithdrawBeenApplied(slot)) {
      callback("Error: Requested withdraw slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", slot, curr_state, new_state)
    await instance.applyWithdrawals(slot, merkle_root, curr_state, new_state, await instance.getWithdrawHash(slot))
    console.log("Successfully applied Withdrawals!")
    callback()
  } catch (error) {
    callback(error)
  }
}
