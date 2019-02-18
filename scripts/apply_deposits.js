const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 2) {
      callback("Error: This script requires arguments - <slot> <new state root>")
    }
    const [slot, new_state] = arguments
    
    const instance = await SnappBase.deployed()
    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    const deposit_state = await instance.deposits.call(slot)
    if (deposit_state.appliedAccountStateIndex != 0) {
      callback("Error: Requested deposit slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", slot, curr_state, new_state)
    await instance.applyDeposits(slot, curr_state, new_state, deposit_state.shaHash)
    const updated_state = await instance.deposits.call(slot)
    console.log("Successfully applied Deposits!")
    console.log("New appliedAccountStateIndex is:", updated_state.appliedAccountStateIndex.toNumber())
    callback()
  } catch (error) {
    callback(error)
  }
}
