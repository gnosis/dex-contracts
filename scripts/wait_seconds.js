const { waitForNSeconds } = require("../test/utilities.js")
const { getArgumentsHelper } = require("./script_utilities.js")

module.exports = async callback => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <seconds>")
    }
    const [seconds] = arguments
    await waitForNSeconds(parseInt(seconds), web3)
    console.log("waited", seconds, "seconds")
    callback()
  } catch (error) {
    callback(error)
  }
}
