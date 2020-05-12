const BatchExchange = artifacts.require("BatchExchange")

const BN = require("bn.js")
const { maxUint32, sendLiquidityOrders } = require("./utilities")
const { getOrdersPaginated } = require("../build/common/src/onchain_reading")

const MINIMAL_LIQUIDITY_FOR_OWL = new BN(10).pow(new BN(17))
const SELL_ORDER_AMOUNT_OWL = new BN(10).pow(new BN(18)).mul(new BN(5))
// All orders provided by this liquidity script  will sell OWL for a very high price:
// At 1000 [token]/[OWL]. In most of the cases this will ensure that 1 [OWL] is valued
// higher than 1 dollar. For tokens valued below 1/10000 USD, OWL can be extracted profitably
// from these orders. But since we only sell 5 OWL and 10 OWL have to be spent to add one token,
// stealing OWL by adding new tokens will not be profitable.
const PRICE_FOR_LIQUIDITY_PROVISION = new BN(10000)

const containsSellOrderProvidingLiquidity = function (orders) {
  return orders.some(
    (order) => order.sellTokenBalance.gt(MINIMAL_LIQUIDITY_FOR_OWL) && order.remainingAmount.gt(MINIMAL_LIQUIDITY_FOR_OWL)
  )
}

// This function checks whether it is likely that Gnosis has already povided liquidity for this token
// with an liquidity-order. The check depends on the match of two order criteria: SellAmount and validUntil.
// Despite being just an heuristic check, it should be sufficient for now.
const hasOWLLiquidityOrderAlreadyBeenPlaced = function (orders) {
  return orders.some((order) => order.priceDenominator.eq(SELL_ORDER_AMOUNT_OWL) && order.validUntil.eq(maxUint32))
}

module.exports = async (callback) => {
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

    // Get the order data
    const numberOfToken = await instance.numTokens.call()
    const batchId = (await instance.getCurrentBatchId()).toNumber()
    let orders = await getOrdersPaginated(instance.contract, 100)
    orders = orders.filter((order) => order.validUntil >= batchId && order.validFrom <= batchId)

    // Ensure OWL-liquidity is given
    const tokensRequiringLiquidityProvision = []
    for (let tokenId = 1; tokenId < numberOfToken; tokenId++) {
      const tokenAddress = await instance.tokenIdToAddressMap.call(tokenId)
      console.log("Checking liquidity for token: ", tokenAddress)
      const ordersForTokenId = orders.filter((order) => order.buyToken == tokenId && order.sellToken == 0)
      if (!containsSellOrderProvidingLiquidity(ordersForTokenId) && !hasOWLLiquidityOrderAlreadyBeenPlaced(ordersForTokenId)) {
        tokensRequiringLiquidityProvision.push(tokenId)
      } else {
        console.log("Liquidity is given or has been provided in the past")
      }
    }
    await sendLiquidityOrders(
      instance,
      tokensRequiringLiquidityProvision,
      PRICE_FOR_LIQUIDITY_PROVISION,
      SELL_ORDER_AMOUNT_OWL,
      artifacts
    )
    callback()
  } catch (error) {
    callback(error)
  }
}
