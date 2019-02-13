const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
  try {
    let sliceBy = 4
    if(process.argv.length == 8) {
      sliceBy = 6
    }
    const arguments = await process.argv.slice(sliceBy)
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

    console.log("Current slot for :", slot , " with curr_state", curr_state, " and new_state", new_state)
    await instance.applyDeposits(slot, curr_state, new_state, deposit_state.shaHash)
    const deposit_state2 = await instance.deposits.call(slot)
    console.log("New appliedAccountStateIndex is:",deposit_state2.appliedAccountStateIndex )
    callback()
  } catch (error) {
    callback(error)
  }
}