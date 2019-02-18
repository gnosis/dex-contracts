const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 4) {
      callback("Error: This script requires arguments - <slot> <inclusion bitMap> <merkle root> <new state root>")
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
    console.log("New appliedAccountStateIndex is:", updated_state.appliedAccountStateIndex )
    callback()
  } catch (error) {
    callback(error)
  }
}
