const send = function (method, params, web3Provider) {
  return new Promise(function (resolve, reject) {
    const jsonrpc = "2.0"
    const id = 0
    web3Provider.currentProvider.send({ id, jsonrpc, method, params }, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    })
  })
}

const sendTxAndGetReturnValue = async function (method, ...args) {
  const result = await method.call(...args)
  await method(...args)
  return result
}

/**
 * Wait for n (evm) seconds to pass
 * @param seconds: int
 * @param web3Provider: potentially different in contract tests and system end-to-end testing.
 */
const waitForNSeconds = async function (seconds, web3Provider = web3) {
  await send("evm_increaseTime", [seconds], web3Provider)
  await send("evm_mine", [], web3Provider)
}

const toHex = function (buffer) {
  buffer = buffer.toString("hex")
  if (buffer.substring(0, 2) == "0x") return buffer
  return "0x" + buffer.toString("hex")
}

module.exports = {
  toHex,
  waitForNSeconds,
  sendTxAndGetReturnValue,
}
