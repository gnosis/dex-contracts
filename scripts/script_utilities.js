
const getArgumentsHelper = function () {
  const arguments = process.argv.slice(4)
  const index = arguments.indexOf("--network")
  if (index > -1) {
    arguments.splice(index, 2)
  }
  return arguments
}

const getOrderData = async function (instance, callback, web3, argv) {
  if ([argv.accountId, argv.buyToken, argv.sellToken, argv.minBuyArg, argv.maxSellArg].indexOf != -1) {
    callback("Error: This script requires the following arguments: --accountId, --buyToken, --sellToken, --minBuy, --maxSell")
  }

  const minBuy = new web3.utils.BN(web3.utils.toWei(argv.minBuyArg))
  const maxSell = new web3.utils.BN(web3.utils.toWei(argv.maxSellArg))

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

module.exports = {
  getArgumentsHelper,
  getOrderData
}
