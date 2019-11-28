const SnappAuction = artifacts.require("SnappAuction")
const argv = require("yargs")
  .option("slot", {
    describe: "Deposit slot to apply"
  })
  .option("newStateRoot", {
    describe: "Updated account state after applying deposits"
  })
  .demand(["slot", "newStateRoot"])
  .help(false)
  .version(false).argv

module.exports = async callback => {
  try {
    const instance = await SnappAuction.deployed()
    const curr_state = await instance.getCurrentStateRoot()

    if (await instance.hasDepositBeenApplied(argv.slot)) {
      callback("Error: Requested deposit slot has already been applied")
    }

    console.log("Current slot for: %d with curr_state %s and new_state %s", argv.slot, curr_state, argv.new_state)
    const deposit_hash = await instance.getDepositHash(argv.slot)
    await instance.applyDeposits(argv.slot, curr_state, argv.new_state, deposit_hash)
    console.log("Successfully applied Deposits!")
    callback()
  } catch (error) {
    callback(error)
  }
}
