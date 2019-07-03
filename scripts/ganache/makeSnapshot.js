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

module.exports = callback => 
  makeSnapshot()
    .then(callback)
    .catch(callback)
