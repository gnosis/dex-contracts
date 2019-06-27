
const { getArgumentsHelper } = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length > 2) {
      callback("Error: This script requires arguments - <make> or <revert> <snapshotId>")
    }
    const [todo, snapId] = arguments
    
    if (todo == "make") {
      console.log("Making snapshot")
      const result = await makeSnapshot()
      callback(result)
    } else if (todo == "revert") {
      console.log(`Reverting snapshot ${snapId}`)
      await revertSnapshot(snapId)
      callback()
    }
  } catch(error) {
    callback(error)
  }
}

const makeSnapshot = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_snapshot"
    }, (err, { result }) => {
      if (err) {
        return reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

const revertSnapshot = snapshotId => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_revert",
      params: [snapshotId]
    }, (err, result) => {
      if (err) {
        return reject(err)
      } else {
        resolve(result)
      }
    })
  })
}