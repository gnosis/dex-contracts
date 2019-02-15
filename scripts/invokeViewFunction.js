const SnappBase = artifacts.require("SnappBase")

// This script allows to view data from the SnappBase contract
// example for viewing the current stateRoots: truffle exec scripts/viewSnappBaseForCurrentIndex.js 'stateRoots'

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    var index = arguments.indexOf("--network");
    if (index > -1) {
      arguments.splice(index, 2);
    }
    if (arguments.length < 1) {
      callback("Error: This script requires arguments - <functionName>")
    }
    const [functionName] = arguments
    
    const instance = await SnappBase.deployed()
    const info = await instance[functionName].call()
    
    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}