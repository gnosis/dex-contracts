import BN from "bn.js"
import { toETH, feeAdded, feeSubtracted, ERROR_EPSILON } from "../math"
import { generateTestCase } from "./generate"

export * from "./generate"

const ZERO = new BN(0)

export const basicTrade = generateTestCase({
  name: "Basic Trade",
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
      buyAmount: toETH(10),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(10),
      buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
      user: 1,
    },
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

export const advancedTrade = generateTestCase({
  name: "Advanced Trade",
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
      buyAmount: toETH(10),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(10),
      buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
      user: 1,
    },
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
      buyAmount: toETH(10),
      user: 2,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(10),
      buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
      user: 3,
    },
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
      buyAmount: toETH(10),
      user: 4,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(10),
      buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
      user: 5,
    },
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

export const biggieSmallTrade = generateTestCase({
  name: "Biggie Small",
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(185),
      buyAmount: toETH(1),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(1000),
      buyAmount: toETH(184000),
      user: 1,
    },
  ],
  solutions: [
    {
      name: "Max Fulfillment",
      prices: [toETH(1), feeAdded(toETH(184))],
      buyVolumes: [1, 184].map(toETH),
    },
  ],
})

export const basicRingTrade = generateTestCase({
  name: "Basic Ring",
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 2,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 1,
    },
    {
      sellToken: 2,
      buyToken: 0,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 2,
    },
  ],
  solutions: [
    {
      name: "Ring Around the Rosie",
      prices: [1, 1, 1].map(toETH),
      buyVolumes: [feeSubtracted(toETH(1), 1), feeSubtracted(toETH(1), 2), feeSubtracted(toETH(1), 3)],
    },
  ],
})

const n = 30
export const largeRing30 = generateTestCase({
  name: "Longest Ring Trade",
  orders: Array.from(Array(n).keys())
    .map((i) => ({
      sellToken: i % n,
      buyToken: (i + 1) % n,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: i % 2,
    }))
    .concat(
      Array.from(Array(n).keys()).map((i) => ({
        sellToken: i % n,
        buyToken: (i + 1) % n,
        sellAmount: toETH(1),
        buyAmount: toETH(0.99),
        user: 2 + (i % 2),
      }))
    ),
  solutions: [
    {
      name: "Solution filling ~90% of the available volume",
      prices: [
        new BN("1000000000000000000"),
        new BN("999000000079933840"),
        new BN("998001000078845135"),
        new BN("997002999140535506"),
        new BN("996005996035392883"),
        new BN("995009990083786472"),
        new BN("994014980130495716"),
        new BN("993020965086898658"),
        new BN("992027944164247585"),
        new BN("991035916140546385"),
        new BN("990044880290088817"),
        new BN("989054835391299816"),
        new BN("988065780510318410"),
        new BN("987077714823955022"),
        new BN("986090637068828536"),
        new BN("985104546427501883"),
        new BN("984119441847563266"),
        new BN("983135322401663687"),
        new BN("982152187132755565"),
        new BN("981170034910294548"),
        new BN("980188864899078269"),
        new BN("979208676045659066"),
        new BN("978229467305820489"),
        new BN("977251237858427284"),
        new BN("976273986614832057"),
        new BN("975297712672815304"),
        new BN("974322414953157214"),
        new BN("973348092529574952"),
        new BN("982063340537758779"),
        new BN("990991090090097194"),
      ],
      buyVolumes: Array(30)
        .fill(new BN(0))
        .concat([
          new BN("899999909927988434"),
          new BN("899999909928898147"),
          new BN("899999909873138748"),
          new BN("899999909968923181"),
          new BN("899999909928736570"),
          new BN("899999909895423467"),
          new BN("899999909952944811"),
          new BN("899999909914445655"),
          new BN("899999909986676388"),
          new BN("899999909926967303"),
          new BN("899999909943800566"),
          new BN("899999909985327246"),
          new BN("899999909899485749"),
          new BN("899999909936269665"),
          new BN("899999909940159650"),
          new BN("899999909970806338"),
          new BN("899999909974515710"),
          new BN("899999909925496645"),
          new BN("899999909957902274"),
          new BN("899999909936146659"),
          new BN("899999909925595398"),
          new BN("899999909984286761"),
          new BN("899999909965948230"),
          new BN("899999909971236827"),
          new BN("899999909930081941"),
          new BN("899999909936534371"),
          new BN("899999909944513216"),
          new BN("891120914814366045"),
          new BN("882209793797187023"),
          new BN("873387783197991000"),
        ]),
    },
    {
      name: "Full solution to large ring trade",
      prices: [
        new BN("1000000000000000000"),
        new BN("999000000080932527"),
        new BN("998001000163952351"),
        new BN("997002999153048099"),
        new BN("996005996120621788"),
        new BN("995009990197501127"),
        new BN("994014980201782351"),
        new BN("993020965255715327"),
        new BN("992027944249700231"),
        new BN("991035916321243854"),
        new BN("990044880335294951"),
        new BN("989054835476903275"),
        new BN("988065780622280566"),
        new BN("987077714922662489"),
        new BN("986090637193173669"),
        new BN("985104546487832659"),
        new BN("984119441958561945"),
        new BN("983135322499977058"),
        new BN("982152187194035945"),
        new BN("981170035069292740"),
        new BN("980188864985054793"),
        new BN("979208676167400239"),
        new BN("978229467438980960"),
        new BN("977251237967802060"),
        new BN("976273986723981212"),
        new BN("975297712793135196"),
        new BN("974322415061859070"),
        new BN("973348092626909555"),
        new BN("982063340537758779"),
        new BN("990991090090097095"),
      ],
      buyVolumes: [
        new BN("999999900018987366"),
        new BN("999999899935720167"),
        new BN("999999899946492752"),
        new BN("999999899979899439"),
        new BN("999999899906533389"),
        new BN("999999899912087908"),
        new BN("999999899877713252"),
        new BN("999999899918800176"),
        new BN("999999899902864002"),
        new BN("999999899973191776"),
        new BN("999999899951005325"),
        new BN("999999899970382379"),
        new BN("999999899888317721"),
        new BN("999999899903089341"),
        new BN("999999899972267613"),
        new BN("999999899954772667"),
        new BN("999999899971684198"),
        new BN("999999899954824426"),
        new BN("999999899891175087"),
        new BN("999999899941337511"),
        new BN("999999899893002057"),
        new BN("999999899946416798"),
        new BN("999999899950243776"),
        new BN("999999899956239066"),
        new BN("999999899898945833"),
        new BN("999999899917915929"),
        new BN("999999899938348141"),
        new BN("990134349892753397"),
        new BN("980233104317120013"),
        new BN("970430870317033000"),
      ].concat(Array(30).fill(new BN(0))),
    },
  ],
})

export const shortRingBetterTrade = generateTestCase({
  orders: [
    // ring trade orders
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 2,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 1,
    },
    {
      sellToken: 2,
      buyToken: 0,
      sellAmount: toETH(1),
      buyAmount: toETH(0.99),
      user: 2,
    },
    // biggie small orders
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(185),
      buyAmount: toETH(1),
      user: 3,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(1000),
      buyAmount: toETH(184000),
      user: 4,
    },
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
export const exampleOrderWithUnlimitedAmount = generateTestCase(
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
export const tooSmallSellAmountTrade = generateTestCase(
  {
    deposits: [
      { amount: feeAdded(tenThousand), token: 0, user: 0 },
      { amount: feeAdded(tenThousand), token: 1, user: 1 },
    ],
    orders: [
      {
        sellToken: 0,
        buyToken: 1,
        sellAmount: feeAdded(tenThousand),
        buyAmount: fiveThousand,
        user: 0,
      },
      {
        sellToken: 1,
        buyToken: 0,
        sellAmount: feeAdded(tenThousand),
        buyAmount: fiveThousand,
        user: 1,
      },
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

export const tooSmallBuyAmountTrade = generateTestCase(
  {
    deposits: [
      { amount: feeAdded(tenThousand), token: 0, user: 0 },
      { amount: feeAdded(tenThousand), token: 1, user: 1 },
    ],
    orders: [
      {
        sellToken: 0,
        buyToken: 1,
        sellAmount: feeAdded(tenThousand),
        buyAmount: fiveThousand,
        user: 0,
      },
      {
        sellToken: 1,
        buyToken: 0,
        sellAmount: feeAdded(tenThousand),
        buyAmount: fiveThousand,
        user: 1,
      },
    ],
    solutions: [
      {
        name: "Small buy amounts",
        prices: [1, 1].map(toETH),
        buyVolumes: [10000, 9990].map((val) => new BN(val)),
      },
    ],
  },
  false,
  true
)

const fiftyThousand = new BN("50000")
const hundredThousand = new BN("100000")
export const smallExample = generateTestCase({
  deposits: [
    { amount: feeAdded(hundredThousand), token: 0, user: 0 },
    { amount: new BN(190), token: 1, user: 1 },
    { amount: new BN(9), token: 0, user: 1 },
    { amount: feeAdded(hundredThousand), token: 1, user: 2 },
  ],
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(hundredThousand),
      buyAmount: fiftyThousand,
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: feeAdded(hundredThousand),
      buyAmount: fiftyThousand,
      user: 1,
    },
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(hundredThousand),
      buyAmount: fiftyThousand,
      user: 1,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: feeAdded(hundredThousand),
      buyAmount: fiftyThousand,
      user: 2,
    },
  ],
  solutions: [
    {
      name: "Small Solution",
      prices: [1, 1].map(toETH),
      buyVolumes: [100000, 99900, 99810, 99711].map((val) => new BN(val)),
    },
  ],
})

export const stableXExample = generateTestCase({
  deposits: [
    { amount: toETH(3000), token: 0, user: 0 },
    { amount: toETH(3000), token: 1, user: 0 },
  ],
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(2000),
      buyAmount: toETH(999),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(999),
      buyAmount: toETH(1996),
      user: 1,
    },
  ],
  solutions: [
    {
      name: "Naive Solver",
      prices: [toETH(1), new BN("1999998997996995993")],
      buyVolumes: [toETH(999), new BN("1996000999999999998010")],
    },
  ],
})

export const marginalTrade = generateTestCase({
  name: "Marginal Trade",
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
      buyAmount: toETH(10),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 0,
      sellAmount: toETH(10),
      buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
      user: 1,
    },
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: feeAdded(toETH(200000)).add(ERROR_EPSILON),
      buyAmount: toETH(100000),
      user: 2,
    },
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

export const utilityOverflow = generateTestCase({
  deposits: [
    { amount: toETH(10), token: 0, user: 0 },
    { amount: toETH(1), token: 1, user: 1 },
    { amount: toETH(100), token: 2, user: 2 },
  ],
  orders: [
    {
      sellToken: 0,
      buyToken: 1,
      sellAmount: toETH(10),
      buyAmount: new BN("10000000000000000"),
      user: 0,
    },
    {
      sellToken: 1,
      buyToken: 2,
      sellAmount: toETH(1),
      buyAmount: new BN("1000"),
      user: 1,
    },
    {
      sellToken: 2,
      buyToken: 1,
      sellAmount: toETH(100),
      buyAmount: toETH(1),
      user: 2,
    },
  ],
  solutions: [
    {
      name: "Utility Overflow",
      prices: ["1000000000000000000", "998999900119977150048", "10000000000198528574"].map((val) => new BN(val)),
      buyVolumes: ["1998999800099984", "99800080039994614733", "998000900199892164"].map((val) => new BN(val)),
    },
  ],
})
