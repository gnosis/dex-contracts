const SnappAuction = artifacts.require("SnappAuction")
const { getArgumentsHelper } = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 2) {
      callback("Error: This script requires arguments - <slot> <new state root>")
    }
    const [slot, new_state] = arguments
    
    const instance = await SnappAuction.deployed()
    const curr_state = await instance.getCurrentStateRoot()

    if (await instance.hasDepositBeenApplied(slot)) {
      callback("Error: Requested deposit slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", slot, curr_state, new_state)
    await instance.applyDeposits(slot, curr_state, new_state, await instance.getDepositHash(slot))
    console.log("Successfully applied Deposits!")
    callback()
  } catch (error) {
    callback(error)
  }
}
