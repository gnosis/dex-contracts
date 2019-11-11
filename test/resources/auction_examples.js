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

function feeSubtracted(x) {
  assert(BN.isBN(x))
  return x.mul(feeDenominatorMinusOne).div(feeDenominator)
}

function feeAdded(x) {
  assert(BN.isBN(x))
  return x.mul(feeDenominator).div(feeDenominatorMinusOne)
}

function getExecutedSellAmount(executedBuyAmount, buyTokenPrice, sellTokenPrice) {
  // assert([executedBuyAmount, buyTokenPrice, sellTokenPrice].all(BN.isBN))
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
  const limitTerm = limitTermLeft.sub(limitTermRight)
  console.log(limitTermLeft.toString(), limitTermRight.toString())
  assert(!limitTerm.isNeg())
  return leftoverSellAmount.mul(limitTerm).div(order.sellAmount)
}

function maxUtility(order, prices) {
  const limitTermLeft = prices[order.sellToken].mul(order.sellAmount).mul(feeDenominatorMinusOne).div(feeDenominator)
  const limitTermRight = prices[order.buyToken].mul(order.buyAmount)
  const limitTerm = limitTermLeft.sub(limitTermRight)
  return limitTerm
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
  log("Disregarded Utilities:", orderDisregardedUtilities.map(o => o.toString()))

  log("2U - maxU:", trade.orders.map((x, i) =>
    evaluateTradeUtility(x, solution.buyVolumes[i], solution.prices).mul(new BN(2))
      .sub(maxUtility(x, solution.prices)).toString()))

  const feesPerOrder = trade.orders.map((x, i) => {
    if (x.buyToken === 0) {
      return solution.buyVolumes[i].neg()
    } else if (x.sellToken === 0) {
      return getExecutedSellAmount(solution.buyVolumes[i], solution.prices[x.buyToken], solution.prices[x.sellToken])
    } else {
      new BN(0)
    }
  })
  log("Fees Per Order:", feesPerOrder.map(x => x.toString()))

  const totalFees = feesPerOrder.reduce((acc, x) => acc.add(x), new BN(0))
  log("Total Fees:", totalFees.toString())

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
  return objectiveValue
}

function generateTestCase(trade, solutions, debug = false) {
  const testCase = Object.assign({ solutions: [] }, trade)
  for (const solution of solutions) {
    if (debug) {
      console.log(`Computing objective value for ${solution.name}`)
    }
    const objectiveValue = evaluateObjectiveValue(trade, solution, debug)
    testCase.solutions.push(Object.assign({ objectiveValue }, solution))
  }
  return testCase
}

/////--------------- Basic Trade used in many of the tests:

const user_1 = "Alex"
const user_2 = "Ben"
const user_3 = "Felix"
const user_4 = "Nick"
const user_5 = "Tom"
const user_6 = "Chuck Norris"

const basicTrade = {
  deposits: [
    { amount: toETH(20), token: 0, user: user_1 },
    { amount: feeAdded(toETH(20)), token: 1, user: user_2 }
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: user_1 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: user_2 }
  ],
}

const basicTradeSolutions = [
  {
    name: "Full solution",
    prices: [1, 2].map(toETH),
    owners: [user_1, user_2],
    buyVolumes: basicTrade.orders.map(order => order.buyAmount)
  },
  {
    name: "Partial solution",
    prices: [1, 2].map(toETH),
    owners: [user_1, user_2],
    buyVolumes: basicTrade.orders.map(order => order.buyAmount.mul(new BN(9)).div(new BN(10)))
  }
]

/////--------------- Advanced Trade

const advancedTrade = {
  deposits: [
    { amount: toETH(20), token: 0, user: user_1 },
    { amount: feeAdded(toETH(20)), token: 1, user: user_2 },
    { amount: toETH(20), token: 0, user: user_3 },
    { amount: feeAdded(toETH(20)), token: 1, user: user_4 },
    { amount: toETH(20), token: 0, user: user_5 },
    { amount: feeAdded(toETH(20)), token: 1, user: user_6 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: user_1 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: user_2 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: user_3 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: user_4 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(amountEpsilon), buyAmount: toETH(10), user: user_5 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(amountEpsilon), user: user_6 },
  ],
}

const advancedTradeSolutions = [
  {
    name: "Match 1 pair",
    prices: [1, 2].map(toETH),
    owners: [user_1, user_2],
    buyVolumes: advancedTrade.orders.map((x, i) => i < 2 ? x.buyAmount : new BN(0))
  },
  {
    name: "Match 2 pairs",
    prices: [1, 2].map(toETH),
    owners: [user_1, user_2, user_3, user_4],
    buyVolumes: advancedTrade.orders.map((x, i) => i < 4 ? x.buyAmount : new BN(0))
  },
  {
    name: "Match 3 pairs",
    prices: [1, 2].map(toETH),
    owners: [user_1, user_2, user_3, user_4, user_5, user_6],
    buyVolumes: advancedTrade.orders.map(order => order.buyAmount)
  }
]


/////--------------- One large (market maker) and one small (market order)

const biggieSmallTrade = {
  deposits: [
    { amount: toETH(185), token: 0, user: user_1 },
    { amount: toETH(1000), token: 1, user: user_2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(185), buyAmount: toETH(1), user: user_1 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(1000), buyAmount: toETH(184000), user: user_2 },
  ]
}

const biggieSmallTradeSolutions = [
  {
    name: "Max Fulfillment",
    prices: [toETH(1), new BN("184184184184184185000")],
    owners: [user_1, user_2],
    buyVolumes: [toETH(1), new BN("184000000000000000815")],
    sellVolumes: [new BN("184368552736921106106"), toETH(1)],
  }
]

/////--------------- Two orders A -> B and two orders B -> A 

const fiveHunnit = toETH(500)
const tenThouzy = toETH(10000)

const doubleDoubleTrade = {
  deposits: [
    { amount: fiveHunnit, token: 0, user: user_1 },
    { amount: fiveHunnit, token: 1, user: user_2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: fiveHunnit, buyAmount: tenThouzy, user: user_1 },
    { sellToken: 1, buyToken: 0, sellAmount: fiveHunnit, buyAmount: tenThouzy, user: user_2 },
    { sellToken: 0, buyToken: 1, sellAmount: fiveHunnit, buyAmount: tenThouzy, user: user_2 },
    { sellToken: 1, buyToken: 0, sellAmount: fiveHunnit, buyAmount: tenThouzy, user: user_3 }
  ]
}

const doubleDoubleTradeSolutions = [
  {
    name: "Not sure about this one...",
    prices: [1, 1].map(toETH),
    owners: [user_1, user_2, user_1, user_2],
    buyVolume: [100, 99, 98, 97].map(toETH),
    tokenIdsForPrice: [0, 1],
  },
]

/////--------------- Basic Ring Trade example A -> B -> C

const basicRingTrade = {
  deposits: [
    { amount: toETH(100), token: 0, user: user_1 },
    { amount: toETH(100), token: 1, user: user_2 },
    { amount: toETH(100), token: 2, user: user_3 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(100), buyAmount: feeAdded(toETH(100)), user: user_1 },
    { sellToken: 1, buyToken: 2, sellAmount: toETH(100), buyAmount: feeAdded(toETH(100)), user: user_2 },
    { sellToken: 2, buyToken: 0, sellAmount: toETH(100), buyAmount: feeAdded(toETH(100)), user: user_3 }
  ],
}

const basicRingTradeSolutions = [
  {
    name: "Simple Ring",
    prices: [1, 1, 1].map(toETH),
    owners: [user_1, user_2, user_3],
    buyVolume: [100, 99, 98].map(toETH),
    tokenIdsForPrice: [0, 1, 2],
  },
]


const basicTradeCase = generateTestCase(basicTrade, basicTradeSolutions)
// console.log(JSON.stringify(basicTradeCase, null, "  "))

const advancedTradeCase = generateTestCase(advancedTrade, advancedTradeSolutions)
// console.log(JSON.stringify(advancedTradeCase, null, "  "))

const biggieSmallCase = generateTestCase(biggieSmallTrade, biggieSmallTradeSolutions)
// console.log(JSON.stringify(biggieSmallCase, null, "  "))

const doubleDoubleTradeCase = generateTestCase(doubleDoubleTrade, doubleDoubleTradeSolutions)
// console.log(JSON.stringify(doubleDoubleTradeCase, null, "  "))

const basicRingTradeCase = generateTestCase(basicRingTrade, basicRingTradeSolutions)
// console.log(JSON.stringify(doubleDoubleTradeCase, null, "  "))

module.exports = {
  advancedTradeCase,
  basicTradeCase,
  biggieSmallCase,
  doubleDoubleTradeCase,
  basicRingTradeCase
}







// function disregardedUtilityWithLargeHelpfulError(order, executedBuyAmount, prices) {
//   const executedSellAmount = getExecutedSellAmount(executedBuyAmount, prices[order.buyToken], prices[order.sellToken])
//   // Not accounting for balances here.
//   // Contract evaluates as: MIN(sellAmount - executedSellAmount, user.balance.sellToken)
//   const leftoverSellAmount = order.sellAmount.sub(executedSellAmount)
//   const limitTermLeft = prices[order.sellToken].mul(order.sellAmount)
//   const limitTermRight = prices[order.buyToken].mul(feeDenominator).div(feeDenominatorMinusOne).mul(order.buyAmount)
//   const limitTerm = limitTermLeft.sub(limitTermRight)
//   assert(!limitTerm.isNeg())
//   return leftoverSellAmount.mul(limitTerm).div(order.sellAmount)
// }

