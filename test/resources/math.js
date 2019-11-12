const BN = require("bn.js")
const assert = require("assert")

/**
 * @typedef Order
 * @type {object}
 * @property {number} buyToken The buy token
 * @property {BN} buyAmount The buy amount
 * @property {number} sellToken The buy token
 * @property {BN} sellAmount The sell amount
 * @property {number} user The user ID for the order
 *
 * @typedef Solution
 * @type {object}
 * @property {string?} name an optional descriptive name
 * @property {BN[]} prices The prices for each token
 * @property {BN[]} buyVolumes The executed buy amounts for each order
 */

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
const feeDenominator = new BN(1000)

/**
 * The fee denominator minus one.
 * @type {BN}
 */
const feeDenominatorMinusOne = feeDenominator.sub(new BN(1))

/**
 * Removes fees to the specified value `n` times.
 * @param {BN} x The value to apply the fee to
 * @param {number} [n=1] The number of times to apply the fee, defaults to 1
 * @return {BN} The value minus fees
 */
function feeSubtracted(x, n = 1) {
  assert(BN.isBN(x))
  assert(Number.isInteger(n) && n > 0)

  var result = new BN(x)
  for (; n > 0; n--) {
    result = result.imul(feeDenominatorMinusOne).div(feeDenominator)
  }
  return result
}

/**
 * Adds fees to the specified.
 * @param {BN} x The value to apply the fee to
 * @return {BN} The value plus fees
 */
function feeAdded(x) {
  assert(BN.isBN(x))

  return x.mul(feeDenominator).div(feeDenominatorMinusOne)
}

/**
 * The error epsilon required for buy/sell amounts to account for rounding
 * errors.
 * @type {BN}
 */
const amountEpsilon = new BN(999000)

/**
 * Calculates the executed buy amout given a buy volume and the settled buy and
 * sell prices.
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN} buyTokenPrice The buy token price
 * @param {BN} sellTokenPrice The sell token price
 * @return {BN} The value plus fees
 */
function getExecutedSellAmount(executedBuyAmount, buyTokenPrice, sellTokenPrice) {
  assert(BN.isBN(executedBuyAmount))
  assert(BN.isBN(buyTokenPrice))
  assert(BN.isBN(sellTokenPrice))

  return executedBuyAmount.mul(buyTokenPrice).div(feeDenominatorMinusOne).mul(feeDenominator).div(sellTokenPrice)
}

/**
 * Calculates the utility of an order given an executed buy amount and settled
 * solution prices.
 * @param {Order} order The order
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN[]} prices The prices
 * @return {BN} The order's utility
 */
function orderUtility(order, executedBuyAmount, prices) {
  assert(BN.isBN(executedBuyAmount))
  assert(Array.isArray(prices))

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
  assert(BN.isBN(executedBuyAmount))
  assert(Array.isArray(prices))

  const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
  // Not accounting for balances here.
  // Contract evaluates as: MIN(sellAmount - executedSellAmount, user.balance.sellToken)
  const leftoverSellAmount = order.sellAmount.sub(executedSellAmount)
  const limitTermLeft = prices[order.sellToken].mul(order.sellAmount)
  const limitTermRight = prices[order.buyToken].mul(order.buyAmount).mul(feeDenominator).div(feeDenominatorMinusOne)
  let limitTerm = new BN(0)
  if (limitTermLeft.gt(limitTermRight)) {
    limitTerm = limitTermLeft.sub(limitTermRight)
  }
  return leftoverSellAmount.mul(limitTerm).div(order.sellAmount)
}

/**
 * Calculates the total objective value for the specified solution given the
 * order book.
 * @param {Order[]} orders The orders
 * @param {Solution} solution The solution
 * @return {BN} The solution's objective value
 */
function solutionObjectiveValue(orders, solution) {
  const tokenCount = Math.max(...orders.map(o => [o.buyToken, o.sellToken]).flat()) + 1

  assert(orders.length === solution.buyVolumes.length)
  assert(tokenCount === solution.prices.length)

  const totalFees = orders.reduce(
    (acc, o, i) => {
      if (o.buyToken === 0) {
        return acc.isub(solution.buyVolumes[i])
      } else if (o.sellToken === 0) {
        const sellVolume = getExecutedSellAmount(
          solution.buyVolumes[i],
          solution.prices[o.buyToken],
          solution.prices[o.sellToken]
        )
        return acc.iadd(sellVolume)
      } else {
        return acc
      }
    },
    new BN(0)
  )

  const objectiveValue = new BN(0)
  for (let i = 0; i < orders.length; i++) {
    if (solution.buyVolumes[i].isZero()) {
      continue
    }
    const utility = orderUtility(orders[i], solution.buyVolumes[i], solution.prices)
    objectiveValue.iadd(utility)
    const disregardedUtility = orderDisregardedUtility(orders[i], solution.buyVolumes[i], solution.prices)
    objectiveValue.isub(disregardedUtility)
  }
  objectiveValue.iadd(totalFees.div(new BN(2)))

  return objectiveValue
}

module.exports = {
  toETH,
  feeSubtracted,
  feeAdded,
  amountEpsilon,
  orderUtility,
  orderDisregardedUtility,
  solutionObjectiveValue,
}
