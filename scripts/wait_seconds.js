const { waitForNSeconds } = require("../test/utilities.js")
const { getArgumentsHelper } = require("./script_utilities.js")

module.exports = async callback => {
  try {
    const args = getArgumentsHelper()
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
