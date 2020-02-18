const BatchExchange = artifacts.require("BatchExchange")
const { decodeOrdersBN } = require("../../src/encoding.js")
const BN = require("bn.js")
const { sendTxAndGetReturnValue } = require("../../test/utilities.js")
const { fetchTokenInfo } = require("./utilities")
const maxUint32 = new BN(2).pow(new BN(32)).sub(new BN(1))

const MINIMAL_LIQUIDITY_FOR_OWL = new BN(10).pow(new BN(17))
const SELL_ORDER_AMOUNT_OWL = new BN(10).pow(new BN(18)).mul(new BN(5))
const OWL_NUMBER_DIGITS = 18
// All orders provided by this liquidity script  will sell OWL for a very high price:
// At 1000 [token]/[OWL]. In most of the cases this will ensure that 1 [OWL] is valued
// higher than 1 dollar. For tokens valued below 1/10000 USD, OWL can be extracted profitably
// from these orders. But since we only sell 5 OWL and 10 OWL have to be spent to add one token,
// stealing OWL by adding new tokens will not be profitable.
const PRICE_FOR_LIQUIDITY_PROVISION = new BN(10000)

const isOneSellOrderProvidingLiquidity = function(orders) {
  for (const order of orders) {
    if (order.sellTokenBalance.gt(MINIMAL_LIQUIDITY_FOR_OWL) && order.remainingAmount.gt(MINIMAL_LIQUIDITY_FOR_OWL)) {
      return true
    }
  }
  return false
}

// This function checks whether it is likely that there is a liquidity provision order from Gnosis
// in the set of the orders. It does so by looking at two order criteria: SellAmount and validUntil.
// While this is really just a heuristic check, it should be sufficient for now.
const hasOWLLiquidityOrderAlreadyBeenPlaced = function(orders) {
  for (const order of orders) {
    if (order.priceDenominator.eq(SELL_ORDER_AMOUNT_OWL) && order.validUntil == maxUint32.toNumber()) {
      return true
    }
  }
  return false
}

const sendLiquidityOrder = async function(instance, tokenId) {
  const tokenAddress = await instance.tokenIdToAddressMap.call(tokenId)

  const numberOfDigits = (await fetchTokenInfo(instance, [tokenId], artifacts))[tokenId].decimals
  let minBuy
  if (numberOfDigits < OWL_NUMBER_DIGITS) {
    minBuy = SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).div(
      new BN(10).pow(new BN(OWL_NUMBER_DIGITS - numberOfDigits))
    )
  } else {
    minBuy = SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).mul(
      new BN(10).pow(new BN(numberOfDigits - OWL_NUMBER_DIGITS))
    )
  }
  const id = await sendTxAndGetReturnValue(instance.placeOrder, tokenId, 0, maxUint32, minBuy, SELL_ORDER_AMOUNT_OWL)
  console.log(`Placed liquidity sell order successfully for token ${tokenAddress} with id: ${id}`)
}

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    const owlTokenAddress = await instance.tokenIdToAddressMap.call(0)
    const accounts = await web3.eth.getAccounts()
    const liquidityEnsurer = await accounts[0]

    // check that liquidityEnsurer has sufficient OWL in the exchange:
    const owlBalance = await instance.getBalance(liquidityEnsurer, owlTokenAddress)
    if (new BN(10).pow(new BN(18)).gt(owlBalance)) {
      callback("Error: The OWL balance is below the 10 OWL threshold, please stock it up again")
    }

    // Get the data
    const numberOfToken = await instance.numTokens.call()
    const ordersData = await instance.getEncodedOrders.call({ gas: 8e9 })
    const batchId = (await instance.getCurrentBatchId()).toNumber()
    let orders = decodeOrdersBN(ordersData)
    orders = orders.filter(order => order.validUntil >= batchId && order.validFrom <= batchId)

    // Ensure OWL-liquidity is given
    for (let tokenId = 1; tokenId < numberOfToken; tokenId++) {
      const tokenAddress = await instance.tokenIdToAddressMap.call(tokenId)
      console.log("Checking liquidity for token: ", tokenAddress)
      const ordersForTokenId = orders.filter(order => order.buyToken == tokenId && order.sellToken == 0)
      if (!isOneSellOrderProvidingLiquidity(ordersForTokenId) && !hasOWLLiquidityOrderAlreadyBeenPlaced(ordersForTokenId)) {
        await sendLiquidityOrder(instance, tokenId)
      } else {
        console.log("Liquidity is given or has been provided in the past")
      }
    }
    callback()
  } catch (error) {
    callback(error)
  }
}
