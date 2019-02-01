const SnappBase = artifacts.require("SnappBase")

module.exports = async (callback) => {
  try {
    const arguments = await process.argv.slice(4)
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <targetStateHash>")
    }
    const [targetStateHash] = arguments
    
    const instance = await SnappBase.deployed()
    const state_index = (await instance.stateIndex.call()).toNumber()
    const curr_state = await instance.stateRoots.call(state_index)
    try {
      if (curr_state != targetStateHash) {
        throw ("Error: stateHash not correct")
      } 
    } 
    catch(error) {
        throw new Error(error)
    }
    
    callback()
  } catch (error) {
    callback(error)
  }
}
