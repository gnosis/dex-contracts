const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const TokenOWL = artifacts.require("TokenOWL")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

const BN = require("bn.js")
const truffleAssert = require("truffle-assertions")
const { waitForNSeconds, sendTxAndGetReturnValue } = require("../build/common/test/utilities")

const { closeAuction } = require("../scripts/utilities.js")
const { decodeOrdersBN } = require("../src/encoding")

const { toETH, getExecutedSellAmount, ERROR_EPSILON, feeAdded, feeSubtracted } = require("../build/common/test/resources/math")
const {
  solutionSubmissionParams,
  basicTrade,
  advancedTrade,
  basicRingTrade,
  shortRingBetterTrade,
  smallExample,
  marginalTrade,
  exampleOrderWithUnlimitedAmount,
} = require("../build/common/test/resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

const fiveThousand = new BN("5000")
const tenThousand = new BN("10000")
const smallTradeData = {
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
}

contract("BatchExchange", async (accounts) => {
  const [user_1, user_2, user_3, solver, competingSolver] = accounts
  const zero_address = "0x0000000000000000000000000000000000000000"

  let BATCH_TIME
  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link("IdToAddressBiMap", lib1.address)
    await BatchExchange.link("IterableAppendOnlySet", lib2.address)
    const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

    BATCH_TIME = (await batchExchange.BATCH_TIME.call()).toNumber()
  })

  // In the following tests, it might be possible that an batchId is read from the blockchain
  // and in the next moment this batchId is no longer the current one. In order to prevent these
  // situations, we set the adjust the start-time of each test to the start of an new auction.
  beforeEach(async () => {
    const batchExchange = await BatchExchange.deployed()
    await closeAuction(batchExchange)
  })

  describe("addToken()", () => {
    it("feeToken is set by default", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

      assert.equal((await batchExchange.tokenAddressToIdMap.call(feeToken.address)).toNumber(), 0)
      assert.equal(await batchExchange.tokenIdToAddressMap.call(0), feeToken.address)
    })
    it("Anyone can add tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

      const token_1 = await ERC20.new()
      await batchExchange.addToken(token_1.address, { from: user_1 })

      assert.equal((await batchExchange.tokenAddressToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await batchExchange.tokenIdToAddressMap.call(1), token_1.address)
      const token_2 = await ERC20.new()
      await batchExchange.addToken(token_2.address, { from: user_2 })

      assert.equal((await batchExchange.tokenAddressToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await batchExchange.tokenIdToAddressMap.call(2), token_2.address)
    })
    it("Rejects same token added twice", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)
      const token = await ERC20.new()
      await batchExchange.addToken(token.address)
      await truffleAssert.reverts(batchExchange.addToken(token.address), "Token already registered")
    })
    it("No exceed max tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(3, feeToken.address)
      await batchExchange.addToken((await ERC20.new()).address)
      await batchExchange.addToken((await ERC20.new()).address)

      await truffleAssert.reverts(batchExchange.addToken((await ERC20.new()).address), "Max tokens reached")
    })
    it("Burns 10 OWL when adding token", async () => {
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const owlAmount = toETH(10)

      await owlProxy.mintOWL(user_1, owlAmount)

      const batchExchange = await BatchExchange.new(2, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(batchExchange.address, owlAmount)
      assert(owlAmount.eq(await owlProxy.balanceOf(user_1)))
      assert(owlAmount.eq(await owlProxy.allowance(user_1, batchExchange.address)))

      await batchExchange.addToken(token.address, { from: user_1 })
      assert((await owlProxy.balanceOf(user_1)).eq(new BN(0)))
    })
    it("throws if OWL is not burned", async () => {
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const owlAmount = toETH(10)

      const batchExchange = await BatchExchange.new(2, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(batchExchange.address, owlAmount)
      assert(owlAmount.eq(await owlProxy.allowance.call(user_1, batchExchange.address)))

      // reverts as owl balance is not sufficient
      await truffleAssert.reverts(batchExchange.addToken(token.address, { from: user_1 }))
    })
  })
  describe("placeOrder()", () => {
    it("rejects orders between same tokens", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      await truffleAssert.reverts(
        batchExchange.placeValidFromOrders.call([0], [0], [currentBatch - 1], [1], [1], [1]),
        "Exchange tokens not distinct"
      )
    })
    it("rejects orders for unlisted tokens", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      await truffleAssert.reverts(batchExchange.placeOrder(2, 0, currentBatch + 1, 1, 1), "Buy token must be listed")
      await truffleAssert.reverts(batchExchange.placeOrder(0, 2, currentBatch + 1, 1, 1), "Sell token must be listed")
    })
    it("places order and verifys contract storage is updated correctly", async () => {
      const batchExchange = await setupGenericStableX()

      const currentStateIndex = await batchExchange.getCurrentBatchId()
      const id = await batchExchange.placeOrder.call(0, 1, 3, 10, 20, {
        from: user_1,
      })
      await batchExchange.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const orderResult = await batchExchange.orders.call(user_1, id)
      assert.equal(orderResult.priceDenominator.toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal(orderResult.priceNumerator.toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal(orderResult.sellToken.toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal(orderResult.buyToken.toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal(orderResult.validFrom.toNumber(), currentStateIndex.toNumber(), "validFrom was stored incorrectly")
      assert.equal(orderResult.validUntil.toNumber(), 3, "validUntil was stored incorrectly")
    })
  })
  describe("placeValidFromOrders()", () => {
    it("rejects orders places in the past", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      await truffleAssert.reverts(
        batchExchange.placeValidFromOrders.call([0], [1], [currentBatch - 1], [1], [1], [1]),
        "Orders can't be placed in the past"
      )
    })
    it("places single order with specified validFrom", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      const id = await batchExchange.placeValidFromOrders.call([0], [1], [currentBatch], [3], [10], [20], {
        from: user_1,
      })

      await batchExchange.placeValidFromOrders([0], [1], [currentBatch], [3], [10], [20], { from: user_1 })
      const orderResult = await batchExchange.orders.call(user_1, id)
      assert.equal(orderResult.priceDenominator.toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal(orderResult.priceNumerator.toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal(orderResult.sellToken.toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal(orderResult.buyToken.toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal(orderResult.validFrom.toNumber(), currentBatch, "validFrom was stored incorrectly")
      assert.equal(orderResult.validUntil.toNumber(), 3, "validUntil was stored incorrectly")
    })
    it("rejects orders with invalid array input", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      await truffleAssert.fails(
        batchExchange.placeValidFromOrders([0, 1], [1], [currentBatch], [3], [10], [20]),
        "invalid opcode"
      )
    })
    it("places multiple orders with sepcified validFrom", async () => {
      const batchExchange = await setupGenericStableX()
      const currentBatch = (await batchExchange.getCurrentBatchId()).toNumber()
      const ids = (
        await sendTxAndGetReturnValue(
          batchExchange.placeValidFromOrders,
          [0, 1],
          [1, 0],
          [currentBatch, currentBatch],
          [3, 4],
          [10, 11],
          [20, 21],
          {
            from: user_1,
          }
        )
      ).map((x) => x.toNumber())

      // sanity check the IDs returned from the call before testing the orders with particular IDs
      assert.deepEqual(ids, [0, 1])

      const orderResult0 = await batchExchange.orders.call(user_1, 0)
      assert.equal(orderResult0.priceDenominator.toNumber(), 20, "order 1: priceDenominator was stored incorrectly")
      assert.equal(orderResult0.priceNumerator.toNumber(), 10, "order 1: priceNumerator was stored incorrectly")
      assert.equal(orderResult0.sellToken.toNumber(), 1, "order 1: sellToken was stored incorrectly")
      assert.equal(orderResult0.buyToken.toNumber(), 0, "order 1: buyToken was stored incorrectly")
      // Note that this order will be stored, but never valid. However, this can not affect the exchange in any maliciouis way!
      assert.equal(orderResult0.validFrom.toNumber(), currentBatch, "order 1: validFrom was stored incorrectly")
      assert.equal(orderResult0.validUntil.toNumber(), 3, "order 1: validUntil was stored incorrectly")

      const orderResult1 = await batchExchange.orders.call(user_1, 1)
      assert.equal(orderResult1.priceDenominator.toNumber(), 21, "order 2: priceDenominator was stored incorrectly")
      assert.equal(orderResult1.priceNumerator.toNumber(), 11, "order 2: priceNumerator was stored incorrectly")
      assert.equal(orderResult1.sellToken.toNumber(), 0, "order 2: sellToken was stored incorrectly")
      assert.equal(orderResult1.buyToken.toNumber(), 1, "order 2: buyToken was stored incorrectly")
      // Note that this order will be stored, but never valid. However, this can not affect the exchange in any maliciouis way!
      assert.equal(orderResult1.validFrom.toNumber(), currentBatch, "order 2: validFrom was stored incorrectly")
      assert.equal(orderResult1.validUntil.toNumber(), 4, "order 2: validUntil was stored incorrectly")
    })
  })
  describe("cancelOrders()", () => {
    it("invalidates valid order as of next batch", async () => {
      const batchExchange = await setupGenericStableX()

      const id = await batchExchange.placeOrder.call(0, 1, 3, 10, 20, {
        from: user_1,
      })
      const currentStateIndex = (await batchExchange.getCurrentBatchId()).toNumber()

      await batchExchange.placeOrder(0, 1, currentStateIndex + 3, 10, 20, {
        from: user_1,
      })
      await closeAuction(batchExchange)

      await batchExchange.cancelOrders([id], { from: user_1 })

      assert.equal(
        (await batchExchange.orders.call(user_1, id)).validUntil.toNumber(),
        currentStateIndex,
        "validUntil was stored incorrectly"
      )
    })
    it("frees storage of orders that are not yet valid", async () => {
      const batchExchange = await setupGenericStableX()
      const currentStateIndex = (await batchExchange.getCurrentBatchId()).toNumber()

      await batchExchange.placeValidFromOrders([0], [1], [currentStateIndex + 2], [currentStateIndex + 3], [10], [20], {
        from: user_1,
      })
      await batchExchange.cancelOrders([0], { from: user_1 })

      assert.equal((await batchExchange.orders(user_1, 0)).priceDenominator, 0, "Order data was not cleared")
    })
  })
  describe("replaceOrders()", () => {
    it("cancels and creates new orders", async () => {
      const batchExchange = await setupGenericStableX(8)

      await batchExchange.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const order2 = await sendTxAndGetReturnValue(batchExchange.placeOrder, 2, 3, 5, 30, 40, { from: user_1 })

      const currentStateIndex = (await batchExchange.getCurrentBatchId()).toNumber()
      await batchExchange.replaceOrders(
        [order2],
        [4, 5],
        [6, 7],
        [currentStateIndex, currentStateIndex],
        [11, 12],
        [13, 14],
        [15, 16]
      )

      assert.equal((await batchExchange.orders(user_1, 0)).sellToken, 1, "First order should be present")
      assert.equal((await batchExchange.orders(user_1, 1)).sellToken, 0, "Second order should be removed")
      assert.equal((await batchExchange.orders(user_1, 2)).sellToken, 6, "Third order should be present")
      assert.equal((await batchExchange.orders(user_1, 3)).sellToken, 7, "Fourth order should be present")
    })
  })
  describe("submitSolution()", () => {
    it("rejects if claimed objective is not better than current", async () => {
      const batchExchange = await setupGenericStableX()

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await closeAuction(batchExchange)

      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId, 0, [], [], [], [], []),
        "Claimed objective doesn't sufficiently improve current solution"
      )
    })
    it("rejects trivial solution (the only solution with zero utility)", async () => {
      const batchExchange = await setupGenericStableX()
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await closeAuction(batchExchange)
      const fakeClaimedObjective = 1
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId, fakeClaimedObjective, [], [], [], [toETH(1)], [1], { from: solver }),
        "New objective doesn't sufficiently improve current solution"
      )
    })
    it("[Basic Trade] places two orders and returns calculated utility", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Note: the claimed objective value is intentionally incorrect, this is to make sure that a call
      // to `submitSolution` can be used to acurately determine the objective value of a solution
      const objectiveValue = await batchExchange.submitSolution.call(
        batchId,
        1,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert(objectiveValue > 0, "the computed objective value is greater than 0")
      assert.equal(objectiveValue, solution.objectiveValue.toString())
    })
    it("rejects if fee token not traded", async () => {
      const batchExchange = await setupGenericStableX(3)

      const deposits = [
        { amount: toETH(100), token: 1, user: 0 },
        { amount: toETH(100), token: 2, user: 1 },
      ]
      const orders = [
        {
          sellToken: 1,
          buyToken: 2,
          sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
          buyAmount: toETH(10),
          user: 0,
        },
        {
          sellToken: 2,
          buyToken: 1,
          sellAmount: toETH(10),
          buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
          user: 1,
        },
      ]
      const solution = {
        prices: [1, 1, 2].map(toETH),
        buyVolumes: [toETH(10), feeSubtracted(toETH(20))],
      }

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      const orderIds = await placeOrders(batchExchange, accounts, orders, batchId + 1)
      await closeAuction(batchExchange)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          1 /* objective value */,
          [accounts[0], accounts[1]] /* user ids */,
          orderIds,
          solution.buyVolumes,
          solution.prices.slice(1),
          [1, 2],
          { from: solver }
        ),
        "Token conservation at 0 must be positive"
      )
    })
    it("rejects solutions attempting to set fee token price", async () => {
      const batchExchange = await setupGenericStableX()

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await closeAuction(batchExchange)
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId, 1, [], [], [], [10000], [0]),
        "Fee token has fixed price!"
      )
    })
    it("rejects acclaimed marginally improved solutions", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      const objectiveValue = await batchExchange.getCurrentObjectiveValue.call()
      const improvementDenominator = await batchExchange.IMPROVEMENT_DENOMINATOR.call()

      const tooLowNewObjective = objectiveValue.mul(improvementDenominator.addn(1)).div(improvementDenominator)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          tooLowNewObjective,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Claimed objective doesn't sufficiently improve current solution"
      )
    })
    it("rejects marginally better solutions", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      const tradeCase = marginalTrade
      await makeDeposits(batchExchange, accounts, tradeCase.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, tradeCase.orders, batchId + 1)
      await closeAuction(batchExchange)

      const firstSolution = solutionSubmissionParams(tradeCase.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        firstSolution.objectiveValue,
        firstSolution.owners,
        firstSolution.touchedorderIds,
        firstSolution.volumes,
        firstSolution.prices,
        firstSolution.tokenIdsForPrice,
        { from: solver }
      )
      const insufficientlyBetterSolution = solutionSubmissionParams(tradeCase.solutions[1], accounts, orderIds)
      const improvementDenominator = await batchExchange.IMPROVEMENT_DENOMINATOR.call()
      assert(
        insufficientlyBetterSolution.objectiveValue
          .mul(improvementDenominator)
          .lt(firstSolution.objectiveValue.mul(improvementDenominator.addn(1))),
        `Expected ${insufficientlyBetterSolution.objectiveValue} to be less than marginally better than ${firstSolution.objectiveValue}`
      )
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          firstSolution.objectiveValue.muln(2), // Note must claim better improvement than we have to get this case!
          insufficientlyBetterSolution.owners,
          insufficientlyBetterSolution.touchedorderIds,
          insufficientlyBetterSolution.volumes,
          insufficientlyBetterSolution.prices,
          insufficientlyBetterSolution.tokenIdsForPrice,
          { from: solver }
        ),
        "New objective doesn't sufficiently improve current solution"
      )
    })
    it("rejects competing solution with same objective value", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue.addn(1),
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: competingSolver }
        ),
        "Claimed objective doesn't sufficiently improve current solution"
      )
    })
    it("[Basic Trade] places two orders and matches them in a solution with Utility > 0", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const volume = solution.volumes
      const prices = solution.prices
      const tokenIdsForPrice = solution.tokenIdsForPrice

      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      // TODO - make this general (no user_i, no feeToken and no erc20_2)
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[0], toETH(1))).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        volume[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], toETH(1), prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_2, feeToken),
        volume[1].toString(),
        "Bought tokens were not adjusted correctly"
      )

      // This final assertion isn't really necessary here.
      const currentObjectiveValue = await batchExchange.getCurrentObjectiveValue.call()
      assert.equal(currentObjectiveValue.toString(), solution.objectiveValue.toString())
    })
    it("[Basic Trade] places two orders, matches them partially and then checks correct order adjustments", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const volume = partialSolution.volumes
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedorderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      // TODO - make this more general(no user_i, etc...)
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[0], toETH(1))).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        volume[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], toETH(1), prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_2, feeToken),
        volume[1].toString(),
        "Bought tokens were not adjusted correctly"
      )

      const orderResult1 = await batchExchange.orders.call(user_1, orderIds[0])
      const orderResult2 = await batchExchange.orders.call(user_2, orderIds[1])

      assert.equal(
        orderResult1.usedAmount,
        getExecutedSellAmount(volume[0], prices[0], toETH(1)).toString(),
        "usedAmount was stored incorrectly"
      )
      assert.equal(
        orderResult1.priceDenominator.toString(),
        basicTrade.orders[0].sellAmount.toString(),
        "priceDenominator was stored incorrectly"
      )
      assert.equal(
        orderResult1.priceNumerator.toString(),
        basicTrade.orders[0].buyAmount.toString(),
        "priceNumerator was stored incorrectly"
      )

      assert.equal(
        orderResult2.usedAmount,
        getExecutedSellAmount(volume[1], toETH(1), prices[0]).toString(),
        "usedAmount was stored incorrectly"
      )
      assert.equal(
        orderResult2.priceDenominator.toString(),
        basicTrade.orders[1].sellAmount.toString(),
        "priceDenominator was stored incorrectly"
      )
      assert.equal(
        orderResult2.priceNumerator.toString(),
        basicTrade.orders[1].buyAmount.toString(),
        "priceNumerator was stored incorrectly"
      )
    })
    it("[Basic Trade] places two orders, first matches them partially and then fully in a 2nd solution submission", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      // Solution shared values
      const owners = partialSolution.owners
      const touchedorderIds = partialSolution.touchedorderIds
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      // Submit partial Solution.
      const partialBuyVolumes = partialSolution.volumes
      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        owners,
        touchedorderIds,
        partialBuyVolumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      const partialObjectiveValue = await batchExchange.getCurrentObjectiveValue.call()
      assert.equal(partialObjectiveValue.toString(), partialSolution.objectiveValue.toString())

      // Checks that contract updates the partial solution correctly as expected (only needs to be checked once)
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(partialBuyVolumes[0], prices[0], toETH(1))).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        partialBuyVolumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(partialBuyVolumes[1], toETH(1), prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_2, feeToken),
        partialBuyVolumes[1].toString(),
        "Bought tokens were not adjusted correctly"
      )

      // Submit better (full) solution
      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const fullBuyVolumes = fullSolution.volumes
      await batchExchange.submitSolution(
        batchId,
        fullSolution.objectiveValue,
        owners,
        touchedorderIds,
        fullBuyVolumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      assert((await batchExchange.getCurrentObjectiveValue.call()).eq(fullSolution.objectiveValue))

      // Note that full solution trade execution values have already been verified, but we want to make sure the contract reverted previous solution.
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(fullBuyVolumes[0], prices[0], toETH(1))).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        fullBuyVolumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(fullBuyVolumes[1], toETH(1), prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_2, feeToken),
        fullBuyVolumes[1].toString(),
        "Bought tokens were not adjusted correctly"
      )
    })
    it("ensures half of the token imbalance (fees) is burned and that better solutions don't double-burn", async () => {
      // Fee token shouldn't be a mock here, because we need real return values from balanceOf calls.
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const sufficientAmount = toETH(100)
      const owlAmount = sufficientAmount.mul(new BN(accounts.length))

      await owlProxy.mintOWL(user_1, owlAmount)

      const batchExchange = await BatchExchange.new(2, owlProxy.address)
      await owlProxy.approve(batchExchange.address, owlAmount)

      const token = await MockContract.new()
      await token.givenAnyReturnBool(true)
      await batchExchange.addToken(token.address, { from: user_1 })

      // Ensure all user have sufficient feeToken
      for (const account of accounts) {
        await owlProxy.transfer(account, sufficientAmount, { from: user_1 })
        await owlProxy.approve(batchExchange.address, sufficientAmount, {
          from: account,
        })
      }

      // First Auction
      const tradeExample = basicTrade
      await makeDeposits(batchExchange, accounts, tradeExample.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedorderIds,
        partialSolution.volumes,
        partialSolution.prices,
        partialSolution.tokenIdsForPrice,
        { from: solver }
      )

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedorderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: solver }
      )
      await closeAuction(batchExchange)

      // Second Auction
      const secondTradeExample = advancedTrade
      await makeDeposits(batchExchange, accounts, secondTradeExample.deposits)
      const nextBatchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const secondorderIds = await placeOrders(batchExchange, accounts, secondTradeExample.orders, nextBatchId + 1)
      await closeAuction(batchExchange)

      const initialFeeTokenBalance = await owlProxy.balanceOf(batchExchange.address)
      const secondSolution = solutionSubmissionParams(secondTradeExample.solutions[0], accounts, secondorderIds)
      // This is where the first auction's fees should be burned!
      await batchExchange.submitSolution(
        nextBatchId,
        secondSolution.objectiveValue,
        secondSolution.owners,
        secondSolution.touchedorderIds,
        secondSolution.volumes,
        secondSolution.prices,
        secondSolution.tokenIdsForPrice,
        { from: solver }
      )
      const afterAuctionFeeTokenBalance = await owlProxy.balanceOf(batchExchange.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterAuctionFeeTokenBalance))

      // Better second solution
      const betterSolution = solutionSubmissionParams(secondTradeExample.solutions[1], accounts, secondorderIds)
      // This is where the first auction's fees should be burned!
      await batchExchange.submitSolution(
        nextBatchId,
        betterSolution.objectiveValue,
        betterSolution.owners,
        betterSolution.touchedorderIds,
        betterSolution.volumes,
        betterSolution.prices,
        betterSolution.tokenIdsForPrice,
        { from: solver }
      )
      const afterBetterSolutionFeeBalance = await owlProxy.balanceOf(batchExchange.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterBetterSolutionFeeBalance))
    })
    it("verifies the 2nd solution is correctly documented and can be reverted by a 3rd", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, advancedTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, advancedTrade.orders, batchId + 1)

      await closeAuction(batchExchange)

      assert(advancedTrade.solutions.length >= 3, "This test must always run on a sequence of at least three solutions.")
      for (const solution of advancedTrade.solutions) {
        const { owners, touchedorderIds, volumes, prices, tokenIdsForPrice } = solutionSubmissionParams(
          solution,
          accounts,
          orderIds
        )

        await batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          owners,
          touchedorderIds,
          volumes,
          prices,
          tokenIdsForPrice,
          { from: solver }
        )
        // This is only really necessary for the third submission... but whateva.
        assert.equal(
          (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
          advancedTrade.deposits[0].amount.sub(getExecutedSellAmount(volumes[0], prices[0], toETH(1))).toString(),
          "Sold tokens were not adjusted correctly"
        )
        assert.equal(
          await batchExchange.getBalance.call(user_1, erc20_2),
          volumes[0].toString(),
          "Bought tokens were not adjusted correctly"
        )
        assert.equal(
          (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
          advancedTrade.deposits[1].amount.sub(getExecutedSellAmount(volumes[1], toETH(1), prices[0])).toString(),
          "Sold tokens were not adjusted correctly"
        )
        assert.equal(
          await batchExchange.getBalance.call(user_2, feeToken),
          volumes[1].toString(),
          "Bought tokens were not adjusted correctly"
        )
      }
    })
    it("throws if the batchId is incorrect", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Correct batchId would be batchId
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId - 1,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("[Basic Trade] rejects solution submission after 4 minute deadline is over", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)

      const time_remaining = (await batchExchange.getSecondsRemainingInBatch()).toNumber()
      await waitForNSeconds(time_remaining + 241)

      const updatedBatchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Should be exactly one second past when solutions are being accepted.
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          updatedBatchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("[Basic Trade] throws if order(s) not yet valid", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        // NOTE: This is different than usual tests!
        orderIds.push(
          (
            await sendTxAndGetReturnValue(
              batchExchange.placeValidFromOrders, // <------ Right here!
              [order.buyToken],
              [order.sellToken],
              [batchId + 1],
              [batchId + 2], // <------ and here!
              [order.buyAmount],
              [order.sellAmount],
              { from: accounts[order.user] }
            )
          )[0] // Because placeValidFromOrders returns a list of indices
        )
      }
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      // The orders placed aren't valid until next batch!
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Order is invalid"
      )
    })
    it("throws, if order is no longer valid", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      // NOTE: This is different than usual tests!             -------------->             v- Here -v
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId)
      await closeAuction(batchExchange)
      // Close another auction
      await waitForNSeconds(BATCH_TIME)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      //correct batchId would be batchId
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId + 1,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Order is invalid"
      )
    })
    it("throws, if limit price is not met for an order", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            batchExchange.placeOrder,
            order.buyToken,
            order.sellToken,
            batchId + 1,
            order.buyAmount.add(ERROR_EPSILON), // <------- NOTE THAT THIS IS DIFFERENT
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "limit price not satisfied"
      )
    })
    it("throws, if sell volume is bigger than amount specified in the order", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const badVolumes = solution.volumes.map((amt) => amt.add(new BN(10)))

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          badVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "executedSellAmount bigger than specified in order"
      )
    })
    it("throws, if token conservation does not hold", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          basicTrade.orders.map((x) => x.buyAmount), // <----- THIS IS THE DIFFERENCE!
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Token conservation does not hold"
      )
    })
    it("throws if sell volume is bigger than available balance", async () => {
      const batchExchange = await setupGenericStableX()

      for (const deposit of basicTrade.deposits) {
        const tokenAddress = await batchExchange.tokenIdToAddressMap.call(deposit.token)
        await batchExchange.deposit(tokenAddress, deposit.amount.sub(ERROR_EPSILON), { from: accounts[deposit.user] })
      }

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Amount exceeds user's balance"
      )
    })
    it("reverts, if tokenIds for prices are not sorted", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          [1, 1],
          { from: solver }
        ),
        "prices are not ordered by tokenId"
      )
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          [2, 1],
          { from: solver }
        ),
        "prices are not ordered by tokenId"
      )
    })
    it("reverts, if any prices are less than AMOUNT_MINIMUM", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const zeroPrices = [toETH(1), 0]

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          zeroPrices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "At least one price lower than AMOUNT_MINIMUM"
      )
    })
    it("reverts if any sell amounts are less than AMOUNT_MINIMUM", async () => {
      const batchExchange = await setupGenericStableX()
      await makeDeposits(batchExchange, accounts, smallTradeData.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallTradeData.orders, batchId + 1)
      await closeAuction(batchExchange)

      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId, 1, accounts.slice(0, 2), orderIds, [tenThousand, tenThousand], [toETH(0.9)], [1], {
          from: solver,
        }),
        "sell amount less than AMOUNT_MINIMUM"
      )
    })
    it("reverts if any buy amounts are less than AMOUNT_MINIMUM", async () => {
      const batchExchange = await setupGenericStableX()
      await makeDeposits(batchExchange, accounts, smallTradeData.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallTradeData.orders, batchId + 1)
      await closeAuction(batchExchange)

      const tooSmallBuyAmounts = [10000, 9990].map((val) => new BN(val))
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId, 1, accounts.slice(0, 2), orderIds, tooSmallBuyAmounts, [toETH(1)], [1], {
          from: solver,
        }),
        "buy amount less than AMOUNT_MINIMUM"
      )
    })
    it("checks that findPriceIndex also works, if it decreases the search bounds - all other tests only increase", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        [2, 3, 4].map(toETH),
        [1, 2, 3],
        { from: solver }
      )
    })
    it("grants fee surplus to solution submitter", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(
        basicTrade.solutions[0].burntFees.toString(),
        await batchExchange.getBalance.call(solver, feeToken),
        "fees weren't allocated as expected correctly"
      )
    })
    it("ensures fee deducted from previous submitter, when better solution is submitted", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedorderIds,
        partialSolution.volumes,
        partialSolution.prices,
        partialSolution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(
        basicTrade.solutions[1].burntFees.toString(),
        await batchExchange.getBalance.call(solver, feeToken),
        "fees weren't allocated as expected correctly"
      )

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedorderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: competingSolver }
      )

      assert.equal(0, await batchExchange.getBalance.call(solver, feeToken), "First submitter's reward was not reverted")
    })
    it("ensures that a solution reversion can not be prevented by additional withdrawRequests", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      // relevant user places withdraw request:
      await batchExchange.requestWithdraw(await batchExchange.tokenIdToAddressMap.call(basicTrade.orders[1].buyToken), 1, {
        from: accounts[basicTrade.orders[1].user],
      })
      await batchExchange.requestWithdraw(await batchExchange.tokenIdToAddressMap.call(basicTrade.orders[0].buyToken), 1, {
        from: accounts[basicTrade.orders[0].user],
      })

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedorderIds,
        partialSolution.volumes,
        partialSolution.prices,
        partialSolution.tokenIdsForPrice,
        { from: solver }
      )

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedorderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: competingSolver }
      )
    })
    it("ensures credited tokens can't be withdrawn in same batch as solution submission", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      const relevantUser = accounts[basicTrade.orders[0].user]
      const buyToken = await batchExchange.tokenIdToAddressMap.call(basicTrade.orders[0].buyToken)

      // relevant user places withdraw request:
      await batchExchange.requestWithdraw(buyToken, 100, {
        from: relevantUser,
      })

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(
        batchId + 1,
        (await batchExchange.lastCreditBatchId.call(relevantUser, buyToken)).toString(),
        "Last credited batch for touched buy token should be current batch"
      )
      await truffleAssert.reverts(
        batchExchange.withdraw(relevantUser, buyToken),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("ensures credited feeToken reward can't be withdrawn in same batch as solution submission", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      // solver places withdraw request:
      await batchExchange.requestWithdraw(feeToken, 100, { from: solver })

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(batchId + 1, (await batchExchange.lastCreditBatchId.call(solver, feeToken)).toString())
      await truffleAssert.reverts(
        batchExchange.withdraw(solver, feeToken),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("checks that the objective value is returned correctly after getting into a new batch", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      await closeAuction(batchExchange)
      assert.equal(0, await batchExchange.getCurrentObjectiveValue.call(), "Objective value is not returned correct")
    })
    it("reverts, if downcast from u256 to u128 would change the value", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const wayTooBigPrices = ["340282366920938463463374607431768211455"]
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          wayTooBigPrices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "SafeCast: value doesn't fit in 128 bits"
      )
    })
    it("reverts if max touched orders is exceeded", async () => {
      const batchExchange = await setupGenericStableX()

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const maxTouchedOrders = (await batchExchange.MAX_TOUCHED_ORDERS.call()).toNumber()

      const tooManyOwners = Array(maxTouchedOrders + 1).fill(user_1)
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchId - 1, 1, tooManyOwners, [], [], [toETH(1)], [1]),
        "Solution exceeds MAX_TOUCHED_ORDERS"
      )
    })
    it("[Ring Trade] settles a ring trade between 3 tokens", async () => {
      const batchExchange = await setupGenericStableX(3)

      await makeDeposits(batchExchange, accounts, basicRingTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicRingTrade.orders, batchId + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicRingTrade.solutions[0], accounts, orderIds)
      const { prices, volumes } = solution

      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        volumes,
        prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert((await batchExchange.getCurrentObjectiveValue.call()).eq(solution.objectiveValue))

      // NOTE that orders.length = deposits.length
      assert(basicRingTrade.orders.length == basicRingTrade.deposits.length)
      for (let i = 0; i < basicRingTrade.orders.length; i++) {
        const deposit = basicRingTrade.deposits[i]
        const order = basicRingTrade.orders[i]

        const buyToken = await batchExchange.tokenIdToAddressMap.call(order.buyToken)
        const sellToken = await batchExchange.tokenIdToAddressMap.call(order.sellToken)
        const relevantUser = accounts[order.user]

        const sellTokenBalance = await batchExchange.getBalance.call(relevantUser, sellToken)
        const buyTokenBalance = await batchExchange.getBalance.call(relevantUser, buyToken)

        const expectedSellBalance = deposit.amount.sub(
          getExecutedSellAmount(
            volumes[i],
            basicRingTrade.solutions[0].tokens[order.buyToken].price,
            basicRingTrade.solutions[0].tokens[order.buyToken].price
          )
        )
        assert(sellTokenBalance.eq(expectedSellBalance), `Sold tokens were not adjusted correctly at order index ${i}`)
        assert(buyTokenBalance.eq(volumes[i]), `Bought tokens were not adjusted correctly at order index ${i}`)
      }
    })
    it("checks that currentPrices between different solutions are reset", async () => {
      const batchExchange = await setupGenericStableX(3)

      await makeDeposits(batchExchange, accounts, shortRingBetterTrade.deposits)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, shortRingBetterTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const ringSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        ringSolution.objectiveValue,
        ringSolution.owners,
        ringSolution.touchedorderIds,
        ringSolution.volumes,
        ringSolution.prices,
        ringSolution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(
        ringSolution.prices[1].toString(),
        (await batchExchange.currentPrices.call(2)).toString(),
        "CurrentPrice were not adjusted correctly"
      )

      const directSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        directSolution.objectiveValue,
        directSolution.owners,
        directSolution.touchedorderIds,
        directSolution.volumes,
        directSolution.prices,
        directSolution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(0, (await batchExchange.currentPrices.call(2)).toString(), "CurrentPrice were not adjusted correctly")
    })
    it("checks that solution trades are deleted even if balances are temporarily negative while reverting ", async () => {
      // The following test, a user_2 will receive some tokens and sell these received tokens in one batch.
      // If this batch-trade gets executed and later reverted by another trade, users_2's balance would be temporarily negative, unless
      // in the settlement and reversion not all buyAmounts will be credited first, before the sellAmounts are subtracted.
      // This test checks that we have met this "unless condition" and that the test is not failing due to temporarily negative balances
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const otherToken = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, smallExample.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallExample.orders, batchId + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(smallExample.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      // User 0
      assert.equal(
        (await batchExchange.getBalance.call(accounts[0], otherToken)).toString(),
        solution.volumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(accounts[0], feeToken)).toString(),
        smallExample.deposits[0].amount.sub(getExecutedSellAmount(solution.volumes[0], toETH(1), solution.prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      // User 1
      assert.equal(
        0,
        await batchExchange.getBalance.call(accounts[1], otherToken),
        "Bought and sold tokens were not adjusted correctly"
      )
      assert.equal(0, await batchExchange.getBalance.call(accounts[1], feeToken), 0, "Sold tokens were not adjusted correctly")
      // User 2
      assert.equal(
        (await batchExchange.getBalance.call(accounts[2], feeToken)).toString(),
        solution.volumes[3].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(accounts[2], otherToken)).toString(),
        smallExample.deposits[3].amount.sub(getExecutedSellAmount(solution.volumes[3], solution.prices[0], toETH(1))).toString(),
        "Sold tokens were not adjusted correctly"
      )
      // Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchId,
          solution.objectiveValue + 1,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "New objective doesn't sufficiently improve current solution"
      )
    })
    it("ensures order's usedAmount is not updated, if tracking is unintended", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, exampleOrderWithUnlimitedAmount.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, exampleOrderWithUnlimitedAmount.orders, batchId + 10)
      await closeAuction(batchExchange)

      const firstSolution = solutionSubmissionParams(exampleOrderWithUnlimitedAmount.solutions[0], accounts, orderIds)
      const claimedObjective = new BN(2).pow(new BN(100))
      await batchExchange.submitSolution(
        batchId,
        claimedObjective,
        firstSolution.owners,
        firstSolution.touchedorderIds,
        firstSolution.volumes,
        firstSolution.prices,
        firstSolution.tokenIdsForPrice,
        { from: solver }
      )
      const orderResult1 = await batchExchange.orders.call(firstSolution.owners[1], firstSolution.touchedorderIds[1])
      assert.equal(orderResult1.usedAmount.toString(), 0, "usedAmount was modified, although it should not have been modified")

      //Tests that a reversion is also not changing the usedAmount of the order and that maxUint128 can also be used in priceDenominator
      const secondSolution = solutionSubmissionParams(exampleOrderWithUnlimitedAmount.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        claimedObjective,
        secondSolution.owners,
        secondSolution.touchedorderIds,
        secondSolution.volumes,
        secondSolution.prices,
        secondSolution.tokenIdsForPrice,
        { from: solver }
      )
      const orderResult2 = await batchExchange.orders.call(firstSolution.owners[1], firstSolution.touchedorderIds[1])
      assert.equal(orderResult2.usedAmount.toString(), 0, "usedAmount was modified, although it should not have been modified")
      const orderResult3 = await batchExchange.orders.call(secondSolution.owners[0], secondSolution.touchedorderIds[0])
      assert.equal(orderResult3.usedAmount.toString(), 0, "usedAmount was modified, although it should not have been modified")
    })
    it("partially fills orders in one auction and then fills them some more in the next.", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const prices = partialSolution.prices
      const owners = partialSolution.owners
      const touchedorderIds = partialSolution.touchedorderIds
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice
      // Fill 90% of these orders in first auction.
      await batchExchange.submitSolution(
        batchId,
        partialSolution.objectiveValue,
        owners,
        touchedorderIds,
        partialSolution.volumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      await waitForNSeconds(BATCH_TIME)
      // Fill essentially the remaining amount in
      const remainingBuyVolumes = [toETH(1), new BN("1998000000000000000")]
      // Note: The claimed objective value here is actually incorrect (but irrelevant for this test)
      await batchExchange.submitSolution(
        batchId + 1,
        1,
        owners,
        touchedorderIds,
        remainingBuyVolumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      assert(basicTrade.orders.length == basicTrade.deposits.length)

      for (let i = 0; i < basicTrade.orders.length; i++) {
        const deposit = basicTrade.deposits[i]
        const order = basicTrade.orders[i]

        const buyToken = await batchExchange.tokenIdToAddressMap.call(order.buyToken)
        const sellToken = await batchExchange.tokenIdToAddressMap.call(order.sellToken)
        const relevantUser = accounts[order.user]

        const sellTokenBalance = await batchExchange.getBalance.call(relevantUser, sellToken)
        const buyTokenBalance = await batchExchange.getBalance.call(relevantUser, buyToken)
        const totalExecutedBuy = partialSolution.volumes[i].add(remainingBuyVolumes[i])

        assert.equal(
          deposit.amount
            .sub(
              getExecutedSellAmount(
                totalExecutedBuy,
                basicTrade.solutions[1].tokens[order.buyToken].price,
                basicTrade.solutions[1].tokens[order.sellToken].price
              )
            )
            .toString(),
          sellTokenBalance.toString(),
          `Sold tokens were not adjusted correctly ${i}`
        )
        assert.equal(totalExecutedBuy.toString(), buyTokenBalance.toString(), "Bought tokens were not adjusted correctly")
      }
    })
  })
  describe("getUsersPaginated()", async () => {
    const account_one_and_two = (accounts[0] + accounts[1].slice(2, 42)).toString().toLowerCase()
    it("returns null when no users", async () => {
      const batchExchange = await setupGenericStableX()
      const users = await batchExchange.getUsersPaginated(zero_address, 2)
      assert.equal(null, users)
    })
    it("returns users when less than page size", async () => {
      const batchExchange = await setupGenericStableX()
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100)
      assert.equal(accounts[0].toString().toLowerCase(), (await batchExchange.getUsersPaginated(zero_address, 2)).toString())
    })
    it("returns first page and empty second page when equal to page size", async () => {
      const batchExchange = await setupGenericStableX()
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: accounts[0],
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: accounts[1],
      })

      assert.equal(account_one_and_two, (await batchExchange.getUsersPaginated(zero_address, 2)).toString())
      assert.equal(null, await batchExchange.getUsersPaginated(accounts[1], 2))
    })
    it("returns first page and second page when larger than page size", async () => {
      const batchExchange = await setupGenericStableX()
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: accounts[0],
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: accounts[1],
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: accounts[2],
      })

      assert.equal(account_one_and_two, (await batchExchange.getUsersPaginated(zero_address, 2)).toString())
      assert.equal(accounts[2].toString().toLowerCase(), (await batchExchange.getUsersPaginated(accounts[1], 2)).toString())
    })
  })
  describe("getEncodedUserOrdersPaginated()", async () => {
    it("returns correct orders considering offset and pageSize", async () => {
      const batchExchange = await setupGenericStableX()
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      // Place 3 orders
      for (let i = 0; i < 3; i++) {
        await batchExchange.placeOrder(new BN(1), new BN(0), batchId + 10, new BN(i), new BN(i))
      }

      // get 2nd order with getEncodedUserOrdersPaginated(user_1, 1, 1)
      const auctionElements = decodeOrdersBN(await batchExchange.getEncodedUserOrdersPaginated(user_1, 1, 1))
      assert.equal(auctionElements[0].priceNumerator, 1)
    })
  })
  describe("getEncodedUserOrders()", async () => {
    it("returns null when there are no orders", async () => {
      const batchExchange = await setupGenericStableX()
      const auctionElements = await batchExchange.getEncodedUserOrders(accounts[0])
      assert.equal(auctionElements, null)
    })
    it("returns correct orders whether valid, cancelled or freed", async () => {
      const batchExchange = await setupGenericStableX()
      const zeroBN = new BN(0)
      const tenBN = new BN(10)
      const twentyBN = new BN(20)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const validOrderInfo = {
        user: user_1.toLowerCase(),
        sellTokenBalance: zeroBN,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchId,
        validUntil: batchId + 10,
        priceNumerator: twentyBN,
        priceDenominator: tenBN,
        remainingAmount: tenBN,
      }
      const cancelledOrderInfo = {
        user: user_1.toLowerCase(),
        sellTokenBalance: zeroBN,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchId,
        validUntil: batchId,
        priceNumerator: twentyBN,
        priceDenominator: tenBN,
        remainingAmount: tenBN,
      }
      const freedOrderInfo = {
        user: user_1.toLowerCase(),
        sellTokenBalance: zeroBN,
        buyToken: 0,
        sellToken: 0,
        validFrom: 0,
        validUntil: 0,
        priceNumerator: zeroBN,
        priceDenominator: zeroBN,
        remainingAmount: zeroBN,
      }
      // Place 3 valid orders, cancel first two, wait one batch till and free storage of middle order
      for (let i = 0; i < 3; i++) {
        await batchExchange.placeOrder(
          validOrderInfo.buyToken,
          validOrderInfo.sellToken,
          validOrderInfo.validUntil,
          validOrderInfo.priceNumerator,
          validOrderInfo.priceDenominator
        )
      }

      await batchExchange.cancelOrders([1])
      await waitForNSeconds(BATCH_TIME)
      await batchExchange.cancelOrders([0])

      const auctionElements = decodeOrdersBN(await batchExchange.getEncodedUserOrders(user_1))
      assert.equal(JSON.stringify(auctionElements), JSON.stringify([cancelledOrderInfo, freedOrderInfo, validOrderInfo]))
    })
  })
  describe("getEncodedOrders()", async () => {
    it("returns all orders that are have ever been submitted", async () => {
      const batchExchange = await setupGenericStableX(3)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      const zeroBN = new BN(0)
      const tenBN = new BN(10)
      const orderInfo = [
        {
          user: user_1.toLowerCase(),
          sellTokenBalance: zeroBN,
          buyToken: 1,
          sellToken: 0,
          validFrom: batchId,
          validUntil: batchId,
          priceNumerator: new BN(20),
          priceDenominator: tenBN,
          remainingAmount: tenBN,
        },
        {
          user: user_2.toLowerCase(),
          sellTokenBalance: zeroBN,
          buyToken: 0,
          sellToken: 1,
          validFrom: batchId,
          validUntil: batchId,
          priceNumerator: new BN(500),
          priceDenominator: new BN(400),
          remainingAmount: new BN(400),
        },
      ]
      await batchExchange.placeOrder(1, 0, batchId, 20, 10, { from: user_1 })
      await batchExchange.placeOrder(0, 1, batchId, 500, 400, { from: user_2 })

      const auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(JSON.stringify(auctionElements), JSON.stringify(orderInfo))
    })
    it("credits balance when it's valid", async () => {
      const batchExchange = await setupGenericStableX(3)
      const erc20_1 = await batchExchange.tokenIdToAddressMap.call(1)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(2)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()

      await batchExchange.deposit(erc20_1, 8, { from: user_1 })
      await batchExchange.deposit(erc20_2, 20, { from: user_1 })
      await batchExchange.placeOrder(1, 2, batchId, 20, 10, { from: user_1 })

      let auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(auctionElements[0].sellTokenBalance, 0)

      await waitForNSeconds(BATCH_TIME)

      auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(auctionElements[0].sellTokenBalance, 20)
    })
    it("includes freed orders with empty fields", async () => {
      const batchExchange = await setupGenericStableX()

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(1, 0, batchId + 10, 20, 10)

      let auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchId)

      await closeAuction(batchExchange)
      await batchExchange.cancelOrders([0])

      // Cancellation is active but not yet freed
      auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchId)

      await closeAuction(batchExchange)
      await batchExchange.cancelOrders([0])

      auctionElements = decodeOrdersBN(await batchExchange.getEncodedOrders())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, 0)
    })
    it("returns empty list if there are no orders", async () => {
      const batchExchange = await setupGenericStableX()
      const auctionElements = await batchExchange.getEncodedOrders()
      assert.equal(auctionElements, null)
    })
  })
  describe("getEncodedUsersPaginated", async () => {
    it("returns empty bytes when no users", async () => {
      const batchExchange = await setupGenericStableX()
      const auctionElements = await batchExchange.getEncodedUsersPaginated(zero_address, 0, 10)
      assert.equal(auctionElements, null)
    })
    it("returns three orders one per page", async () => {
      const batchExchange = await setupGenericStableX(3)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_1,
      })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, {
        from: user_1,
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_2,
      })

      const firstPage = decodeOrdersBN(await batchExchange.getEncodedUsersPaginated(zero_address, 0, 1))
      assert.equal(
        JSON.stringify(firstPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      const secondPage = decodeOrdersBN(await batchExchange.getEncodedUsersPaginated(user_1, 1, 1))
      assert.equal(
        JSON.stringify(secondPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 1,
            sellToken: 2,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      const thirdPage = decodeOrdersBN(await batchExchange.getEncodedUsersPaginated(user_1, 2, 1))
      assert.equal(
        JSON.stringify(thirdPage),
        JSON.stringify([
          {
            user: user_2.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      // 4th page is empty
      assert.equal(await batchExchange.getEncodedUsersPaginated(user_2, 1, 1), null)
    })
    it("returns three orders when page size is overlapping users", async () => {
      const batchExchange = await setupGenericStableX(3)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_1,
      })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, {
        from: user_1,
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_2,
      })

      const page = decodeOrdersBN(await batchExchange.getEncodedUsersPaginated(user_1, 1, 2))
      assert.equal(page[0].user, user_1.toLowerCase())
      assert.equal(page[1].user, user_2.toLowerCase())
    })
    it("returns three orders from three users with larger page size", async () => {
      const batchExchange = await setupGenericStableX(3)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_1,
      })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, {
        from: user_2,
      })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_3,
      })

      const page = decodeOrdersBN(await batchExchange.getEncodedUsersPaginated(zero_address, 0, 5))
      assert.equal(page.length, 3)
      assert.equal(page[0].user, user_1.toLowerCase())
      assert.equal(page[1].user, user_2.toLowerCase())
      assert.equal(page[2].user, user_3.toLowerCase())
    })
  })
  describe("hasToken()", async () => {
    it("returns whether token was already added", async () => {
      const batchExchange = await setupGenericStableX()
      const erc20_1 = await MockContract.new()
      assert.equal(await batchExchange.hasToken.call(erc20_1.address), false)
      await batchExchange.addToken(erc20_1.address)

      assert.equal(await batchExchange.hasToken.call(erc20_1.address), true)
    })
  })
})
