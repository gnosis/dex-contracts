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
      buyVolumes: [toETH(10), feeSubtracted(toETH(20))],
    },
    {
      name: "Partial Solution",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(9), feeSubtracted(toETH(18))],
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
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), ZERO, ZERO, ZERO, ZERO],
    },
    {
      name: "Match 2 Pairs",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), toETH(10), feeSubtracted(toETH(20)), ZERO, ZERO],
    },
    {
      name: "Match 3 Pairs",
      prices: [1, 2].map(toETH),
      buyVolumes: [
        toETH(10),
        feeSubtracted(toETH(20)),
        toETH(10),
        feeSubtracted(toETH(20)),
        toETH(10),
        feeSubtracted(toETH(20)),
      ],
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

const longRingTrade = generateTestCase({
  name: "Longest Ring Trade",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 2, buyToken: 3, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 3, buyToken: 4, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 4, buyToken: 5, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 5, buyToken: 6, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 6, buyToken: 7, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 7, buyToken: 8, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 8, buyToken: 9, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 9, buyToken: 10, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 10, buyToken: 11, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 11, buyToken: 12, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 12, buyToken: 13, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 13, buyToken: 14, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 14, buyToken: 15, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 15, buyToken: 16, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 16, buyToken: 17, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 17, buyToken: 18, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 18, buyToken: 19, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 19, buyToken: 20, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 20, buyToken: 21, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 21, buyToken: 22, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 22, buyToken: 23, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
    { sellToken: 23, buyToken: 24, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 1 },
    { sellToken: 24, buyToken: 0, sellAmount: toETH(1), buyAmount: toETH(0.99), user: 0 },
  ],
  solutions: [
    {
      name: "Solution filling ~90% of the available volume",
      prices: [
        new BN("1000000000000000000"),
        new BN("1009090808282730321"),
        new BN("1008081717446494201"),
        new BN("1007073635772135310"),
        new BN("1006066562055620024"),
        new BN("1005060495560243511"),
        new BN("1004055435045911980"),
        new BN("1003051379564584673"),
        new BN("1002048328280586616"),
        new BN("1001046279911392344"),
        new BN("1000045233627158656"),
        new BN("999045188359503807"),
        new BN("998046143167030840"),
        new BN("997048097078168880"),
        new BN("996051048945226375"),
        new BN("995054997920334641"),
        new BN("994059942934068358"),
        new BN("993065882926373743"),
        new BN("992072817063661920"),
        new BN("991080744240774517"),
        new BN("990089663541808318"),
        new BN("989099573871175238"),
        new BN("988110474288544080"),
        new BN("987122363763473566"),
        new BN("990991090090097194"),
      ],
      buyVolumes: [
        new BN("899999909927988636"),
        new BN("899999909952944994"),
        new BN("899999909914438536"),
        new BN("899999909986669173"),
        new BN("899999909926960140"),
        new BN("899999909943786061"),
        new BN("899999909985312600"),
        new BN("899999909899478551"),
        new BN("899999909936262378"),
        new BN("899999909940152268"),
        new BN("899999909970806456"),
        new BN("899999909974515821"),
        new BN("899999909925496563"),
        new BN("899999909957902432"),
        new BN("899999909936146709"),
        new BN("899999909925595389"),
        new BN("899999909984286849"),
        new BN("899999909965948383"),
        new BN("899999909971236920"),
        new BN("899999909930081947"),
        new BN("899999909936534426"),
        new BN("899999909944513275"),
        new BN("899999909990813278"),
        new BN("895589917380405377"),
        new BN("886634106870009500"),
      ],
    },
    {
      name: "Full solution to large ring trade",
      prices: [
        new BN("1000000000000000000"),
        new BN("999000000080931820"),
        new BN("998001000221842424"),
        new BN("997002999180664981"),
        new BN("996005996197356869"),
        new BN("995009990131182849"),
        new BN("994014980163113338"),
        new BN("993020965163708305"),
        new BN("992027944279946961"),
        new BN("991035916321027780"),
        new BN("990044880336217272"),
        new BN("989054835473176283"),
        new BN("988065780620993645"),
        new BN("987077714857014362"),
        new BN("986090637204921374"),
        new BN("985104546518301277"),
        new BN("984119442019350586"),
        new BN("983135322524817470"),
        new BN("982152187198533952"),
        new BN("981170035005453049"),
        new BN("980188865026605720"),
        new BN("979208676143003625"),
        new BN("978229467446873433"),
        new BN("982063340537758779"),
        new BN("990991090090097095"),
      ],
      buyVolumes: [
        new BN("999999900018987337"),
        new BN("999999899877713409"),
        new BN("999999899918792119"),
        new BN("999999899902855919"),
        new BN("999999899973183511"),
        new BN("999999899950989007"),
        new BN("999999899970366159"),
        new BN("999999899888309644"),
        new BN("999999899903081291"),
        new BN("999999899972259442"),
        new BN("999999899954772822"),
        new BN("999999899971684106"),
        new BN("999999899954824533"),
        new BN("999999899891175192"),
        new BN("999999899941337554"),
        new BN("999999899893002359"),
        new BN("999999899946416939"),
        new BN("999999899950243943"),
        new BN("999999899956239202"),
        new BN("999999899898946042"),
        new BN("999999899917915939"),
        new BN("999999899938347941"),
        new BN("995099908381601435"),
        new BN("985149007712168325"),
        new BN("975297615164805300"),
      ],
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

const maxUint128 = new BN(2).pow(new BN(128)).sub(new BN(1))
const exampleOrderWithUnlimitedAmount = generateTestCase(
  {
    deposits: [
      { amount: feeAdded(toETH(10)), token: 0, user: 0 },
      { amount: feeAdded(toETH(10)), token: 1, user: 1 },
    ],
    orders: [
      {
        sellToken: 0,
        buyToken: 1,
        sellAmount: maxUint128,
        buyAmount: feeSubtracted(maxUint128.div(new BN(4))),
        user: 0,
      },
      {
        sellToken: 1,
        buyToken: 0,
        sellAmount: toETH(10),
        buyAmount: feeSubtracted(toETH(5)),
        user: 1,
      },
      {
        sellToken: 0,
        buyToken: 1,
        sellAmount: feeAdded(maxUint128.div(new BN(2))),
        buyAmount: maxUint128,
        user: 0,
      },
    ],
    solutions: [
      {
        prices: [1, 0.5].map(toETH),
        buyVolumes: [ZERO, feeSubtracted(toETH(5)), toETH(10)],
      },
      {
        prices: [1, 1].map(toETH),
        buyVolumes: [toETH(10), feeSubtracted(toETH(10)), ZERO],
      },
    ],
  },
  false,
  false
)

const fiveThousand = new BN("5000")
const tenThousand = new BN("10000")
const tooSmallSellAmountTrade = generateTestCase(
  {
    deposits: [
      { amount: feeAdded(tenThousand), token: 0, user: 0 },
      { amount: feeAdded(tenThousand), token: 1, user: 1 },
    ],
    orders: [
      { sellToken: 0, buyToken: 1, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 0 },
      { sellToken: 1, buyToken: 0, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 1 },
    ],
    solutions: [
      {
        name: "Small sell amount",
        prices: [1, 0.9].map(toETH),
        buyVolumes: [tenThousand, tenThousand],
      },
    ],
  },
  false,
  true
)

const tooSmallBuyAmountTrade = generateTestCase(
  {
    deposits: [
      { amount: feeAdded(tenThousand), token: 0, user: 0 },
      { amount: feeAdded(tenThousand), token: 1, user: 1 },
    ],
    orders: [
      { sellToken: 0, buyToken: 1, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 0 },
      { sellToken: 1, buyToken: 0, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 1 },
    ],
    solutions: [
      {
        name: "Small buy amounts",
        prices: [1, 1].map(toETH),
        buyVolumes: [10000, 9990].map(val => new BN(val)),
      },
    ],
  },
  false,
  true
)

const fiftyThousand = new BN("50000")
const hundredThousand = new BN("100000")
const smallExample = generateTestCase({
  deposits: [
    { amount: feeAdded(hundredThousand), token: 0, user: 0 },
    { amount: new BN(190), token: 1, user: 1 },
    { amount: new BN(9), token: 0, user: 1 },
    { amount: feeAdded(hundredThousand), token: 1, user: 2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(hundredThousand), buyAmount: fiftyThousand, user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(hundredThousand), buyAmount: fiftyThousand, user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(hundredThousand), buyAmount: fiftyThousand, user: 1 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(hundredThousand), buyAmount: fiftyThousand, user: 2 },
  ],
  solutions: [
    {
      name: "Small Solution",
      prices: [1, 1].map(toETH),
      buyVolumes: [100000, 99900, 99810, 99711].map(val => new BN(val)),
    },
  ],
})

const stableXExample = generateTestCase({
  deposits: [
    { amount: toETH(3000), token: 0, user: 0 },
    { amount: toETH(3000), token: 1, user: 0 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(2000), buyAmount: toETH(999), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(999), buyAmount: toETH(1996), user: 1 },
  ],
  solutions: [
    {
      name: "Naive Solver",
      prices: [toETH(1), new BN("1999998997996995993")],
      buyVolumes: [toETH(999), new BN("1996000999999999998010")],
    },
  ],
})

const marginalTrade = generateTestCase({
  name: "Marginal Trade",
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON), buyAmount: toETH(10), user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: toETH(10), buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON), user: 1 },
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(toETH(200000)).add(ERROR_EPSILON), buyAmount: toETH(100000), user: 2 },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(100000),
      buyAmount: feeSubtracted(toETH(200000)).sub(ERROR_EPSILON),
      user: 3,
    },
  ],
  solutions: [
    {
      name: "First Solution",
      prices: [1, 2].map(toETH),
      buyVolumes: [toETH(10), feeSubtracted(toETH(20)), ZERO, ZERO],
    },
    {
      name: "Marginally Solution",
      prices: [1, 2].map(toETH),
      buyVolumes: [ZERO, ZERO, toETH(100000), feeSubtracted(toETH(200000))],
    },
  ],
})

const utilityOverflow = generateTestCase({
  deposits: [
    { amount: toETH(10), token: 0, user: 0 },
    { amount: toETH(1), token: 1, user: 1 },
    { amount: toETH(100), token: 2, user: 2 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: toETH(10), buyAmount: new BN("10000000000000000"), user: 0 },
    { sellToken: 1, buyToken: 2, sellAmount: toETH(1), buyAmount: new BN("1000"), user: 1 },
    { sellToken: 2, buyToken: 1, sellAmount: toETH(100), buyAmount: toETH(1), user: 2 },
  ],
  solutions: [
    {
      name: "Utility Overflow",
      prices: ["1000000000000000000", "998999900119977150048", "10000000000198528574"].map(val => new BN(val)),
      buyVolumes: ["1998999800099984", "99800080039994614733", "998000900199892164"].map(val => new BN(val)),
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
    tooSmallBuyAmountTrade,
    tooSmallSellAmountTrade,
    smallExample,
    stableXExample,
    marginalTrade,
    utilityOverflow,
    exampleOrderWithUnlimitedAmount,
    longRingTrade,
  },
  require("./generate")
)
