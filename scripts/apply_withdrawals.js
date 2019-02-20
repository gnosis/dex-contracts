const SnappBase = artifacts.require("SnappBase")
const getArgumentsHelper = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 4) {
      callback("Error: This script requires arguments - <slot> <inclusionBitmap> <merkleRoot> <newStateRoot>")
    }
    const [slot, bitmap, merkle_root, new_state] = arguments
    
    const instance = await SnappBase.deployed()

    // Check bitMap is of correct length
    const expectedBitmapLength = (await instance.MAX_WITHDRAW_BATCH_SIZE.call()).toNumber()
    if (bitmap.length != expectedBitmapLength) {
      const msg = "Error: Bitmap must be boolean array of length " + expectedBitmapLength
      callback(msg)
    }

    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)

    const withdraw_state = await instance.pendingWithdraws.call(slot)
    if (withdraw_state.appliedAccountStateIndex != 0) {
      callback("Error: Requested withdraw slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", slot, curr_state, new_state)
    await instance.applyWithdrawals(slot, Array.from(bitmap).map(b => b == "0"), merkle_root, curr_state, new_state, withdraw_state.shaHash)
    const updated_state = await instance.pendingWithdraws.call(slot)
    console.log("Successfully applied Withdrawals!")
    console.log("New appliedAccountStateIndex is:", updated_state.appliedAccountStateIndex.toNumber())
    callback()
  } catch (error) {
    callback(error)
  }
}
