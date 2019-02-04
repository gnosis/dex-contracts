const SnappBase = artifacts.require("SnappBase")

// This script allows to view data from the SnappBase contract
// example for viewing the current stateRoots: truffle exec scripts/viewSnappBaseForCurrentIndex.js 'stateRoots'

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <targetStateHash>")
    }
    const [functionName] = arguments
    
    const instance = await SnappBase.deployed()
    const state_index = (await instance.stateIndex.call()).toNumber()
    const info = await instance[functionName].call(state_index)
    
    callback(info)
  } catch (error) {
    callback(error)
  }
}
