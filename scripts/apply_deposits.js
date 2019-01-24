
/* eslint-disable no-unused-vars */
/* eslint-disable indent */
const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
    const instance = await SnappBase.deployed()
    const [slot, new_state] = await process.argv.slice(4)

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    if ((await instance.depositHashes.call(slot)).applied == true) {
        console.log("Warning: Requested deposit slot has already been applied")
        callback()
    }
    const tx = await instance.applyDeposits(slot, curr_state, new_state)
    callback()
}
