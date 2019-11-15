const assert = require("assert")
const BN = require("bn.js")
const { flat } = require("./array-shims.js")

/**
 * Converts the amount value to `ether` unit.
 * @param {number} value The amount to convert
 * @return {BN} The value in `ether` as a bignum
 */
function toETH(value) {
  const GWEI = 1000000000
  return new BN(value * GWEI).mul(new BN(GWEI))
}

/**
 * The fee denominator used for calculating fees.
 * @type {BN}
 */
const FEE_DENOMINATOR = new BN(1000)

/**
 * The fee denominator minus one.
 * @type {BN}
 */
const FEE_DENOMINATOR_MINUS_ONE = FEE_DENOMINATOR.sub(new BN(1))

/**
 * Removes fees to the specified value `n` times.
 * @param {BN} x The value to apply the fee to
 * @param {number} [n=1] The number of times to apply the fee, must be greater than 0
 * @return {BN} The value minus fees
 */
function feeSubtracted(x, n = 1) {
  assert(BN.isBN(x), "x is not a bignum")
  assert(Number.isInteger(n) && n > 0, "n is not a valid integer")

  const result = x.mul(FEE_DENOMINATOR_MINUS_ONE).div(FEE_DENOMINATOR)
  return n === 1 ?
    result :
    feeSubtracted(result, n - 1)
}

/**
 * Adds fees to the specified.
 * @param {BN} x The value to apply the fee to
 * @return {BN} The value plus fees
 */
function feeAdded(x) {
  assert(BN.isBN(x), "x is not a bignum")

  return x.mul(FEE_DENOMINATOR).div(FEE_DENOMINATOR_MINUS_ONE)
}

/**
 * The error epsilon required for buy/sell amounts to account for rounding
 * errors.
 * @type {BN}
 */
const ERROR_EPSILON = new BN(999000)

/**
 * Calculates the executed buy amout given a buy volume and the settled buy and
 * sell prices.
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN} buyTokenPrice The buy token price
 * @param {BN} sellTokenPrice The sell token price
 * @return {BN} The value plus fees
 */
function getExecutedSellAmount(executedBuyAmount, buyTokenPrice, sellTokenPrice) {
  assert(BN.isBN(executedBuyAmount), "executedBuyAmount is not a bignum")
  assert(BN.isBN(buyTokenPrice), "buyTokenPrice is not a bignum")
  assert(BN.isBN(sellTokenPrice), "sellTokenPrice is not a bignum")

  return executedBuyAmount.mul(buyTokenPrice).div(FEE_DENOMINATOR_MINUS_ONE).mul(FEE_DENOMINATOR).div(sellTokenPrice)
}

/**
 * @typedef Order
 * @type {object}
 * @property {number} buyToken The buy token
 * @property {BN} buyAmount The buy amount
 * @property {number} sellToken The buy token
 * @property {BN} sellAmount The sell amount
 * @property {number} user The user ID for the order
 */

/**
 * Calculates the utility of an order given an executed buy amount and settled
 * solution prices.
 * @param {Order} order The order
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN[]} prices The prices
 * @return {BN} The order's utility
 */
function orderUtility(order, executedBuyAmount, prices) {
  assert(BN.isBN(executedBuyAmount), "executedBuyAmount is not a bignum")
  assert(Array.isArray(prices), "prices is not an array")
  assert(prices.length > order.buyToken, "order buy token not included in prices")
  assert(prices.length > order.sellToken, "order sell token not included in prices")

  const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
  const execSellTimesBuy = executedSellAmount.mul(order.buyAmount)
  const roundedUtility = executedBuyAmount.sub(execSellTimesBuy.div(order.sellAmount)).mul(prices[order.buyToken])
  const utilityError = execSellTimesBuy.mod(order.sellAmount).mul(prices[order.buyToken]).div(order.sellAmount)
  return roundedUtility.sub(utilityError)
}

/**
 * Calculates the disregarded utility of an order given an executed buy amount
 * and settled solution prices.
 * @param {Order} order The order
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN[]} prices The prices
 * @return {BN} The order's disregarded utility
 */
function orderDisregardedUtility(order, executedBuyAmount, prices) {
  assert(BN.isBN(executedBuyAmount), "executedBuyAmount is not a bignum")
  assert(Array.isArray(prices), "prices is not an array")
  assert(prices.length > order.buyToken, "order buy token not included in prices")
  assert(prices.length > order.sellToken, "order sell token not included in prices")

  const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
  // Not accounting for balances here.
  // Contract evaluates as: MIN(sellAmount - executedSellAmount, user.balance.sellToken)
  const leftoverSellAmount = order.sellAmount.sub(executedSellAmount)
  const limitTermLeft = prices[order.sellToken].mul(order.sellAmount)
  const limitTermRight = prices[order.buyToken].mul(order.buyAmount).mul(FEE_DENOMINATOR).div(FEE_DENOMINATOR_MINUS_ONE)
  let limitTerm = toETH(0)
  if (limitTermLeft.gt(limitTermRight)) {
    limitTerm = limitTermLeft.sub(limitTermRight)
  }
  return leftoverSellAmount.mul(limitTerm).div(order.sellAmount)
}

/**
 * @typedef Solution
 * @type {object}
 * @property {string?} name an optional descriptive name
 * @property {BN[]} prices The prices for each token
 * @property {BN[]} buyVolumes The executed buy amounts for each order
 */

/**
 * Calculates the total objective value for the specified solution given the
 * order book.
 * @param {Order[]} orders The orders
 * @param {Solution} solution The solution
 * @return {BN} The solution's objective value
 */
function solutionObjectiveValue(orders, solution) {
  return solutionObjectiveValueComputation(orders, solution, true).result
}

/**
 * @typedef ObjectiveValueComputation
 * @type {object}
 * @property {BN[][]} orderTokenConservation The token conservation per token per order
 * @property {BN[]} tokenConservation The token conservation for each token
 * @property {BN[]} utilities The utility of each order
 * @property {BN[]} disregardedUtilities The disregarded utility of each order
 * @property {BN} totalUtility The total utility of all the orders
 * @property {BN} totalDisregardedUtility The total disregarded utility of all the orders
 * @property {BN} burntFees The total burnt fees, half of the total fees
 * @property {BN} result The objecitive value result
 */

/**
 * Calculates the solutions objective value returning a computation object with
 * all the intermediate values - useful for debugging.
 * @param {Order[]} orders The orders
 * @param {Solution} solution The solution
 * @param {boolean} [strict=true] Throw when solution is determined to be invalid
 * @return {ObjectiveValueComputation} The solution's objective value computation object
 */
function solutionObjectiveValueComputation(orders, solution, strict = true) {
  const tokenCount = Math.max(...flat(orders.map(o => [o.buyToken, o.sellToken]))) + 1

  assert(orders.length === solution.buyVolumes.length, "solution buy volumes do not match orders")
  assert(tokenCount === solution.prices.length, "solution prices does not include all tokens")
  assert(toETH(1).eq(solution.prices[0]), "fee token price is not 1 ether")

  const feeTokenTouched = orders.findIndex((o, i) =>
    !solution.buyVolumes[i].isZero() && (o.buyToken === 0 || o.sellToken === 0)) !== -1
  assert(feeTokenTouched, "fee token is not touched")

  const touchedOrders = orders
    .map((o, i) => solution.buyVolumes[i].isZero() ? null : [o, i])
    .filter(pair => !!pair)

  const orderExecutedAmounts = orders.map(() => new BN(0))
  const orderTokenConservation = orders.map(() => solution.prices.map(() => new BN(0)))
  const tokenConservation = solution.prices.map(() => new BN(0))
  const utilities = orders.map(() => new BN(0))
  const disregardedUtilities = orders.map(() => new BN(0))

  for (const [order, i] of touchedOrders) {
    const buyVolume = solution.buyVolumes[i]
    const sellVolume = getExecutedSellAmount(
      solution.buyVolumes[i],
      solution.prices[order.buyToken],
      solution.prices[order.sellToken]
    )

    orderExecutedAmounts[i] = { buy: buyVolume, sell: sellVolume }

    orderTokenConservation[i][order.buyToken].isub(buyVolume)
    orderTokenConservation[i][order.sellToken].iadd(sellVolume)

    tokenConservation[order.buyToken].isub(buyVolume)
    tokenConservation[order.sellToken].iadd(sellVolume)

    utilities[i] = orderUtility(order, solution.buyVolumes[i], solution.prices)
    disregardedUtilities[i] = orderDisregardedUtility(order, solution.buyVolumes[i], solution.prices)
  }

  if (strict) {
    assert(!tokenConservation[0].isNeg(), "fee token conservation is negative")
    tokenConservation.slice(1).forEach(
      (conservation, i) => assert(conservation.isZero(), `token conservation not respected for token ${i+1}`)
    )
    touchedOrders.forEach(([, id], i) => {
      assert(!utilities[i].isNeg(), `utility for order ${id} is negative`)
      assert(!disregardedUtilities[i].isNeg(), `disregarded utility for order ${id} is negative`)
    })
  }

  const totalUtility = utilities.reduce((acc, du) => acc.iadd(du), toETH(0))
  const totalDisregardedUtility = disregardedUtilities.reduce((acc, du) => acc.iadd(du), toETH(0))
  const burntFees = tokenConservation[0].div(new BN(2))

  const result = totalUtility.sub(totalDisregardedUtility).add(burntFees)
  if (strict) {
    assert(!result.isNeg() && !result.isZero(), "objective value negative or zero")
  }

  return {
    orderExecutedAmounts,
    orderTokenConservation,
    tokenConservation,
    utilities,
    disregardedUtilities,
    totalUtility,
    totalDisregardedUtility,
    burntFees,
    result,
  }
}

module.exports = {
  toETH,
  feeSubtracted,
  feeAdded,
  ERROR_EPSILON,
  getExecutedSellAmount,
  orderUtility,
  orderDisregardedUtility,
  solutionObjectiveValue,
  solutionObjectiveValueComputation,
}
