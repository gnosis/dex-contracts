const SnappAuction = artifacts.require("SnappAuction")
const { getArgumentsHelper } = require("../script_utilities.js")

// This script allows to view data from the SnappAuction contract
// example for viewing the current stateRoots: truffle exec scripts/snapp/viewSnappBaseForCurrentIndex.js 'stateRoots'

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length < 1) {
      callback("Error: This script requires arguments - <functionName> [..args]")
    }
    const [functionName, ...args] = arguments

    const instance = await SnappAuction.deployed()
    const info = await instance[functionName].call(...args)

    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}