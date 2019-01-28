
/* eslint-disable no-unused-vars */
/* eslint-disable indent */
const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
    const instance = await SnappBase.deployed()
    const [slot, new_state] = await process.argv.slice(4)

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    const deposit_state = await instance.deposits.call(slot)
    if (deposit_state.appliedAccountStateIndex != 0) {
        console.log("Warning: Requested deposit slot has already been applied")
        callback()
    }
    console.log("Current slot for :", slot , " with curr_state", curr_state, " and new_state", new_state)
    const tx = await instance.applyDeposits(slot, curr_state, new_state)
    const deposit_state2 = await instance.deposits.call(slot)
    console.log("New appliedAccountStateIndex is:",deposit_state2.appliedAccountStateIndex )
    callback()
}
