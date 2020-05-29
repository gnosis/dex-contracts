const { waitForNSeconds } = require("../build/common/test/utilities")
const { parseArgs } = require("../build/common/scripts/util")

module.exports = async (callback) => {
  try {
    const args = parseArgs()
    if (args.length != 1) {
      callback("Error: This script requires arguments - <seconds>")
    }
    const [seconds] = args
    await waitForNSeconds(parseInt(seconds), web3)
    console.log("waited", seconds, "seconds")
    callback()
  } catch (error) {
    callback(error)
  }
}
