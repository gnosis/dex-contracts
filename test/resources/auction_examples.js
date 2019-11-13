/* eslint-disable no-console */

const BN = require("bn.js")
const assert = require("assert")

// fee is (1 / feeDenominator)
const feeDenominator = new BN(1000)
const feeDenominatorMinusOne = feeDenominator.sub(new BN(1))

// amount epsilon is used to account for rounding errors in the amount
// calculations so that we don't underflow on limit term calculation
const amountEpsilon = new BN(999000)

function toETH(value) {
  const oneFinney = new BN(10).pow(new BN(15))
  return new BN(value * 1000).mul(oneFinney)
}

function feeSubtracted(x, n) {
  assert(BN.isBN(x))
  const res = x.mul(feeDenominatorMinusOne).div(feeDenominator)
  if (!n || n == 1) {
    return res
  }
  return feeSubtracted(res, n - 1)
}

function feeAdded(x) {
  assert(BN.isBN(x))
  return x.mul(feeDenominator).div(feeDenominatorMinusOne)
}

function getExecutedSellAmount(executedBuyAmount, buyTokenPrice, sellTokenPrice) {
  return executedBuyAmount.mul(buyTokenPrice).div(feeDenominatorMinusOne).mul(feeDenominator).div(sellTokenPrice)
}

function evaluateTradeUtility(order, executedBuyAmount, prices) {
  const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
  const execSellTimesBuy = executedSellAmount.mul(order.buyAmount)
  const roundedUtility = executedBuyAmount.sub(execSellTimesBuy.div(order.sellAmount)).mul(prices[order.buyToken])
  const utilityError = execSellTimesBuy.mod(order.sellAmount).mul(prices[order.buyToken]).div(order.sellAmount)
  return roundedUtility.sub(utilityError)
}

function disregardedUtility(order, executedBuyAmount, prices) {
  const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
  // Not accounting for balances here.
  // Contract evaluates as: MIN(sellAmount - executedSellAmount, user.balance.sellToken)
  const leftoverSellAmount = order.sellAmount.sub(executedSellAmount)
  const limitTermLeft = prices[order.sellToken].mul(order.sellAmount)
  const limitTermRight = prices[order.buyToken].mul(order.buyAmount).mul(feeDenominator).div(feeDenominatorMinusOne)
  // min((sA  * pS // fd  * (fd - 1) // pB), bA) * pB // (fd - 1) * fd 
  let limitTerm = new BN(0)
  if (limitTermLeft.gt(limitTermRight)) {
    limitTerm = limitTermLeft.sub(limitTermRight)
  }
  return leftoverSellAmount.mul(limitTerm).div(order.sellAmount)
}

function evaluateObjectiveValue(trade, solution, debug = false) {
  const log = debug && console.log || (() => { })

  log("buy amounts:", trade.orders.map(order => order.buyAmount.toString()))
  log("sell amounts:", trade.orders.map(order => order.sellAmount.toString()))
  log("Prices:", solution.prices.map(x => x.toString()))
  log("executed buy amounts:", solution.buyVolumes.map(x => x.toString()))
  log("executed sell amounts:", solution.buyVolumes.map((x, i) => {
    const order = trade.orders[i]
    const prices = solution.prices
    return getExecutedSellAmount(x, prices[order.buyToken], prices[order.sellToken]).toString()
  }))

  const orderUtilities = trade.orders.map((x, i) =>
    evaluateTradeUtility(x, solution.buyVolumes[i], solution.prices))
  const orderDisregardedUtilities = trade.orders.map((x, i) =>
    disregardedUtility(x, solution.buyVolumes[i], solution.prices))

  log("Trade Utilities:", orderUtilities.map(o => o.toString()))
  log("Total Utility:", orderUtilities.reduce((acc, x) => acc.add(x), new BN(0)).toString())
  log("Disregarded Utilities:", orderDisregardedUtilities.map(o => o.toString()))
  log("Total Disregarded Utility:", orderDisregardedUtilities.reduce((acc, x) => acc.add(x), new BN(0)).toString())

  const feesPerOrder = trade.orders.map((x, i) => {
    if (x.buyToken === 0) {
      return solution.buyVolumes[i].neg()
    } else if (x.sellToken === 0) {
      return getExecutedSellAmount(solution.buyVolumes[i], solution.prices[x.buyToken], solution.prices[x.sellToken])
    } else {
      return new BN(0)
    }
  })
  log("Fees Per Order:", feesPerOrder.map(x => x.toString()))

  const totalFees = feesPerOrder.reduce((acc, x) => acc.add(x), new BN(0))
  const burntFees = totalFees.div(new BN(2))
  log("Total Fees:", totalFees.toString())
  log("Burnt Fees:", burntFees.toString())

  const objectiveValue = new BN(0)
  for (let i = 0; i < trade.orders.length; i++) {
    if (solution.buyVolumes[i].isZero()) {
      continue
    }
    objectiveValue.iadd(orderUtilities[i])
    objectiveValue.isub(orderDisregardedUtilities[i])
  }
  objectiveValue.iadd(totalFees.div(new BN(2)))

  log("Objective Value:", objectiveValue.toString())
  return { objectiveValue, burntFees }
}

function generateTestCase(trade, solutions, debug = false) {
  const testCase = Object.assign({ solutions: [] }, trade)
  for (const solution of solutions) {
    if (debug) {
      console.log(`Computing objective value for ${solution.name}`)
    }
    const { objectiveValue, burntFees } = evaluateObjectiveValue(trade, solution, debug)
    testCase.solutions.push(Object.assign({ burntFees, objectiveValue }, solution))
  }
  return testCase
}

/////--------------- Basic Trade used in many of the tests:

const basicTrade = {
  deposits: [
    { amount: feeAdded(toETH(20)).add(amountEpsilon), token: 0, user: 0 },
    { amount: toETH(10), token: 1, user: 1 }
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: 1 }
  ],
}

const basicTradeSolutions = [
  {
    name: "Full solution",
    prices: [1, 2].map(toETH),
    owners: [0, 1],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(10), feeSubtracted(toETH(20))]
  },
  {
    name: "Partial solution",
    prices: [1, 2].map(toETH),
    owners: [0, 1],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(9), feeSubtracted(toETH(18))]
  }
]

/////--------------- Advanced Trade

const advancedTrade = {
  deposits: [
    { amount: feeAdded(toETH(20)).add(amountEpsilon), token: 0, user: 0 },
    { amount: toETH(10), token: 1, user: 1 },
    { amount: feeAdded(toETH(20)).add(amountEpsilon), token: 0, user: 2 },
    { amount: toETH(10), token: 1, user: 3 },
    { amount: feeAdded(toETH(20)).add(amountEpsilon), token: 0, user: 4 },
    { amount: toETH(10), token: 1, user: 5 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: 2 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: 3 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: 4 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: 5 },
  ],
}

const zero = new BN(0)
const advancedTradeSolutions = [
  {
    name: "Match 1 pair",
    prices: [1, 2].map(toETH),
    owners: [0, 1],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(10), feeSubtracted(toETH(20)), zero, zero, zero, zero]
  },
  {
    name: "Match 2 pairs",
    prices: [1, 2].map(toETH),
    owners: [0, 1, 2, 3],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20)), zero, zero]
  },
  {
    name: "Match 3 pairs",
    prices: [1, 2].map(toETH),
    owners: [0, 1, 2, 3, 4, 5],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20))]
  }
]

/////--------------- One large (market maker) and one small (market order)

const biggieSmallTrade = {
  deposits: [
    { amount: toETH(185), token: 0, user: 0 },
    { amount: toETH(1000), token: 1, user: 1 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(185), buyAmount: toETH(1), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(1000), buyAmount: toETH(184000), user: 1 },
  ]
}

const biggieSmallTradeSolutions = [
  {
    name: "Max Fulfillment",
    prices: [toETH(1), new BN("184184184184184184184")],
    owners: [0, 1],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [toETH(1), new BN("184000000000000000000")],
    sellVolumes: [new BN("184368552736921106106"), toETH(1)],
  }
]

// /////--------------- Basic Ring Trade example A -> B -> C

const oneETH = toETH(1)
const buyAmt = toETH(0.99)

const basicRingTrade = {
  deposits: [
    { amount: oneETH, token: 0, user: 0 },
    { amount: oneETH, token: 1, user: 1 },
    { amount: oneETH, token: 2, user: 2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: oneETH, buyAmount: buyAmt, user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: oneETH, buyAmount: buyAmt, user: 1 },
    { sellToken: 2, buyToken: 0, sellAmount: oneETH, buyAmount: buyAmt, user: 2 }
  ]
}

const basicRingTradeSolutions = [
  {
    name: "Simple Ring",
    prices: [1, 1, 1].map(toETH),
    owners: [0, 1, 2],
    buyVolumes: [feeSubtracted(oneETH), feeSubtracted(oneETH, 2), feeSubtracted(oneETH, 3)],
    tokenIdsForPrice: [0, 1, 2],
  },
]

// NON-GENERATED EXAMPLES

// Short ring is better

const fiftyETH = toETH(50)
const shortRingBetterTradeCase = {
  deposits: [
    // Very large deposits
    { amount: fiftyETH, token: 0, user: 0 },
    { amount: fiftyETH, token: 1, user: 1 },
    { amount: fiftyETH, token: 2, user: 2 },
    { amount: toETH(185), token: 0, user: 3 },
    { amount: toETH(1000), token: 1, user: 4 },
  ],
  orders: [
    // Ring trade orders
    { sellToken: 0, buyToken: 1, sellAmount: oneETH, buyAmount: buyAmt, user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: oneETH, buyAmount: buyAmt, user: 1 },
    { sellToken: 2, buyToken: 0, sellAmount: oneETH, buyAmount: buyAmt, user: 2 },
    // basic Trade Orders
    { sellToken: 0, buyToken: 1, sellAmount: toETH(185), buyAmount: toETH(1), user: 3 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(1000), buyAmount: toETH(184000), user: 4 },
  ],
  solutions: [
    {
      name: "Ring Trade Solution",
      prices: [1, 1, 1].map(toETH),
      owners: [0, 1, 2],
      buyVolumes: [feeSubtracted(oneETH), feeSubtracted(oneETH, 2), feeSubtracted(oneETH, 3), zero, zero],
      tokenIdsForPrice: [0, 1, 2],
      burntFees: 1498500500000000,
      objectiveValue: 26945990981981981983480482481981982,
    },
    {
      name: "Biggie Small Trade",
      // prices: [toETH(1), new BN("184184184184184185000")],
      prices: [toETH(1), new BN("184184184184184184184")],
      owners: [3, 4],
      tokenIdsForPrice: [0, 1],
      // buyVolumes: [toETH(1), new BN("184000000000000000815")],
      buyVolumes: [toETH(1), toETH(184)],
      burntFees: 184276368460552644,
      objectiveValue: 626507423564715254807956719501111767,
    },
  ]
}

// Trade through a fee provider (user 1)

const fiveThouzy = new BN("5000")
const tenThouzy = new BN("10000")

const smallExample = {
  deposits: [
    { amount: feeAdded(tenThouzy), token: 0, user: 0 },
    { amount: new BN(19), token: 1, user: 1 },
    { amount: feeAdded(tenThouzy), token: 1, user: 2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(tenThouzy), buyAmount: fiveThouzy, user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(tenThouzy), buyAmount: fiveThouzy, user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(tenThouzy), buyAmount: fiveThouzy, user: 1 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(tenThouzy), buyAmount: fiveThouzy, user: 2 },
  ],
}

const smallExampleSolutions = [
  {
    name: "Small Solution",
    prices: [1, 1].map(toETH),
    owners: [0, 1, 1, 2],
    tokenIdsForPrice: [0, 1],
    buyVolumes: [10000, 9990, 9981, 9972].map(val => new BN(val)),
  }
]


const basicTradeCase = generateTestCase(basicTrade, basicTradeSolutions)
const advancedTradeCase = generateTestCase(advancedTrade, advancedTradeSolutions)
const biggieSmallCase = generateTestCase(biggieSmallTrade, biggieSmallTradeSolutions)
const basicRingTradeCase = generateTestCase(basicRingTrade, basicRingTradeSolutions)
const smallExampleCase = generateTestCase(smallExample, smallExampleSolutions)

module.exports = {
  toETH,
  advancedTradeCase,
  basicTradeCase,
  biggieSmallCase,
  getExecutedSellAmount,
  basicRingTradeCase,
  shortRingBetterTradeCase,
  smallExampleCase
}
