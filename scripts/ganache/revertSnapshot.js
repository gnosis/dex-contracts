const { getArgumentsHelper } = require("../script_utilities.js")

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

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <snapId>")
    }
    const [snapId] = arguments
    await revertSnapshot(snapId)
    callback("Revert successful.")
  } catch(error) {
    callback(error)
  }
}