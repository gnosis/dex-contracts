const BN = require("bn.js")
const { toETH, feeAdded, feeSubtracted, ERROR_EPSILON } = require("../math")
const { generateTestCase } = require("./generate")

const ZERO = new BN(0)

const basicTrade = generateTestCase({
  name: "Basic Trade",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON), buyAmount: toETH(10), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON), user: 1 },
  ],
  solutions: [
    {
      name: "Full Solution",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20))]
    },
    {
      name: "Partial Solution",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(9), feeSubtracted(toETH(18))]
    },
  ],
})

const advancedTrade = generateTestCase({
  name: "Advanced Trade",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON), buyAmount: toETH(10), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON), user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON), buyAmount: toETH(10), user: 2 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON), user: 3 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON), buyAmount: toETH(10), user: 4 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON), user: 5 },
  ],
  solutions: [
    {
      name: "Match 1 Pair",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), ZERO, ZERO, ZERO, ZERO]
    },
    {
      name: "Match 2 Pairs",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20)), ZERO, ZERO]
    },
    {
      name: "Match 3 Pairs",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20))]
    },
  ],
})

const biggieSmallTrade = generateTestCase({
  name: "Biggie Small",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(185), buyAmount: toETH(1), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(1000), buyAmount: toETH(184000), user: 1 },
  ],
  solutions: [
    {
      name: "Max Fulfillment",
      prices: [toETH(1), feeAdded(toETH(184))],
      buyVolumes: [1, 184].map(toETH),
    },
  ],
})

const basicRingTrade = generateTestCase({
  name: "Basic Ring",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 2, buyToken: 0, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 2 },
  ],
  solutions: [
    {
      name: "Ring Around the Rosie",
      prices: [1, 1, 1].map(toETH),
      buyVolumes: [feeSubtracted(toETH(1), 1), feeSubtracted(toETH(1), 2), feeSubtracted(toETH(1), 3)],
    },
  ],
})

const shortRingBetterTrade = generateTestCase({
  orders: [
    // ring trade orders
    { sellToken: 0, buyToken: 1, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 2, buyToken: 0, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 2 },
    // biggie small orders
    { sellToken: 0, buyToken: 1, sellAmount: toETH(185), buyAmount: toETH(1), user: 3 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(1000), buyAmount: toETH(184000), user: 4 },
  ],
  solutions: [
    {
      name: "Ring Trade Solution",
      prices: [1, 1, 1].map(toETH),
      buyVolumes: [feeSubtracted(toETH(1), 1), feeSubtracted(toETH(1), 2), feeSubtracted(toETH(1), 3), ZERO, ZERO],
    },
    {
      name: "Biggie Small Trade",
      prices: [toETH(1), feeAdded(toETH(184)), ZERO],
      buyVolumes: [ZERO, ZERO, ZERO, toETH(1), toETH(184)],
    },
  ],
})

const fiveThouzy = new BN("5000")
const tenThouzy = new BN("10000")
const tinyExample = generateTestCase({
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
  solutions: [
    {
      name: "Small Solution",
      prices: [1, 1].map(toETH),
      buyVolumes: [10000, 9990, 9981, 9972].map(val => new BN(val)),
    },
  ],
})


const fiftyThou = new BN("50000")
const HunnitThou = new BN("100000")
const smallExample = generateTestCase({
  deposits: [
    { amount: feeAdded(HunnitThou), token: 0, user: 0 },
    { amount: new BN(19), token: 1, user: 1 },
    { amount: feeAdded(HunnitThou), token: 1, user: 2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(HunnitThou), buyAmount: fiftyThou, user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(HunnitThou), buyAmount: fiftyThou, user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(HunnitThou), buyAmount: fiftyThou, user: 1 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(HunnitThou), buyAmount: fiftyThou, user: 2 },
  ],
  solutions: [
    {
      name: "Small Solution",
      prices: [1, 1].map(toETH),
      buyVolumes: [100000, 99900, 99810, 99711].map(val => new BN(val)),
    },
  ],
})

module.exports = Object.assign(
  {
    basicTrade,
    advancedTrade,
    biggieSmallTrade,
    basicRingTrade,
    shortRingBetterTrade,
    tinyExample,
    smallExample,
  },
  require("./generate"),
)
