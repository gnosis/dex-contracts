const SnappBase = artifacts.require("SnappBase")
const getArgumentsHelper = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <slot> <merkleRoot> <newStateRoot>")
    }
    const [slot, bitmap, merkle_root, new_state] = arguments
    
    const instance = await SnappBase.deployed()

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    const withdraw_state = await instance.pendingWithdraws.call(slot)
    if (withdraw_state.appliedAccountStateIndex != 0) {
      callback("Error: Requested withdraw slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", slot, curr_state, new_state)
    await instance.applyWithdrawals(slot, bitmap, merkle_root, curr_state, new_state, withdraw_state.shaHash)
    const updated_state = await instance.pendingWithdraws.call(slot)
    console.log("Successfully applied Withdrawals!")
    console.log("New appliedAccountStateIndex is:", updated_state.appliedAccountStateIndex.toNumber())
    callback()
  } catch (error) {
    callback(error)
  }
}
