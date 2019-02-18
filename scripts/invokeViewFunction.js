const SnappBase = artifacts.require("SnappBase")
const getArgumentsHelper = require("./script_utilities.js")

// This script allows to view data from the SnappBase contract
// example for viewing the current stateRoots: truffle exec scripts/viewSnappBaseForCurrentIndex.js 'stateRoots'

module.exports = async (callback) => {
  try {
    
    const [functionName] = getArgumentsHelper(1)
    
    const instance = await SnappBase.deployed()
    const info = await instance[functionName].call()
    
    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}