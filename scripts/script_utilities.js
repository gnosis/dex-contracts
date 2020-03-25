const getArgumentsHelper = function () {
  const args = process.argv.slice(4)
  const index = args.indexOf("--network")
  if (index > -1) {
    args.splice(index, 2)
  }
  return args
}

const getOrderData = async function (instance, callback, web3, argv) {
  const minBuy = web3.utils.toWei(String(argv.minBuy))
  const maxSell = web3.utils.toWei(String(argv.maxSell))

  const sender = await instance.accountToPublicKeyMap.call(argv.accountId)
  if (sender == 0x0) {
    callback(`Error: No account registerd at index ${argv.accountId}`)
  }

  const buyTokenAddress = await instance.tokenIdToAddressMap.call(argv.buyToken)
  if (buyTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.buyToken}`)
  }

  const sellTokenAddress = await instance.tokenIdToAddressMap.call(argv.sellToken)
  if (sellTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.sellToken}`)
  }

  return [argv.buyToken, argv.sellToken, minBuy, maxSell, sender]
}

const invokeViewFunction = async function (contract, callback) {
  try {
    const args = getArgumentsHelper()
    if (args.length < 1) {
      callback("Error: This script requires arguments - <functionName> [..args]")
    }
    const [functionName, ...arg] = args

    const instance = await contract.deployed()
    const info = await instance[functionName].call(...arg)

    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}

module.exports = {
  getArgumentsHelper,
  getOrderData,
  invokeViewFunction,
}
