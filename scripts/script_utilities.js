
const getArgumentsHelper = function() {
  const arguments = process.argv.slice(4)
  const index = arguments.indexOf("--network")
  if (index > -1) {
    arguments.splice(index, 2)
  }
  return arguments
}

const getOrderData = async function(instance, callback, web3) {
  const arguments = getArgumentsHelper()
  if (arguments.length != 5) {
    callback("Error: This script requires arguments - <accountId> <buyToken> <sellToken> <minBuy> <maxSell>")
  }
  const [accountId, buyToken, sellToken, minBuy_arg, maxSell_arg] = arguments
  const minBuy = web3.utils.toWei(minBuy_arg)
  const maxSell = web3.utils.toWei(maxSell_arg)

  const sender = await instance.accountToPublicKeyMap.call(accountId)
  if (sender == 0x0) {
    callback(`Error: No account registerd at index ${accountId}`)
  }

  const buyTokenAddress = await instance.tokenIdToAddressMap.call(buyToken)
  if (buyTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${buyToken}`)
  }

  const sellTokenAddress = await instance.tokenIdToAddressMap.call(sellToken)
  if (sellTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${sellToken}`)
  }

  return [buyToken, sellToken, minBuy, maxSell, sender]
}

module.exports = {
  getArgumentsHelper,
  getOrderData
}
