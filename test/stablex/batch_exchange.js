const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const TokenOWL = artifacts.require("TokenOWL")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

const BN = require("bn.js")
const truffleAssert = require("truffle-assertions")
const { waitForNSeconds, sendTxAndGetReturnValue, decodeAuctionElements } = require("../utilities")

const { closeAuction } = require("../../scripts/stablex/utilities.js")

const { toETH, getExecutedSellAmount, ERROR_EPSILON, feeAdded } = require("../resources/math")
const {
  solutionSubmissionParams,
  basicTrade,
  advancedTrade,
  basicRingTrade,
  shortRingBetterTrade,
  smallExample,
} = require("../resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

const feeDenominator = 1000 // fee is (1 / feeDenominator)

const fiveThousand = new BN("5000")
const tenThousand = new BN("10000")
const smallTradeData = {
  deposits: [
    { amount: feeAdded(tenThousand), token: 0, user: 0 },
    { amount: feeAdded(tenThousand), token: 1, user: 1 },
  ],
  orders: [
    { sellToken: 0, buyToken: 1, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 0 },
    { sellToken: 1, buyToken: 0, sellAmount: feeAdded(tenThousand), buyAmount: fiveThousand, user: 1 },
  ],
}

contract("BatchExchange", async accounts => {
  const solver = accounts.pop()
  const competingSolver = accounts.pop()
  const [user_1, user_2] = accounts

  let BATCH_TIME
  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link(IdToAddressBiMap, lib1.address)
    await BatchExchange.link(IterableAppendOnlySet, lib2.address)
    const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    BATCH_TIME = (await batchExchange.BATCH_TIME.call()).toNumber()
  })
  describe("addToken()", () => {
    it("feeToken is set by default", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      assert.equal((await batchExchange.tokenAddressToIdMap.call(feeToken.address)).toNumber(), 0)
      assert.equal(await batchExchange.tokenIdToAddressMap.call(0), feeToken.address)
    })
    it("Anyone can add tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeDenominator, feeToken.address)

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
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const token = await ERC20.new()
      await batchExchange.addToken(token.address)
      await truffleAssert.reverts(batchExchange.addToken(token.address), "Token already registered")
    })
    it("No exceed max tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const batchExchange = await BatchExchange.new(3, feeDenominator, feeToken.address)
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

      const batchExchange = await BatchExchange.new(2, feeDenominator, owlProxy.address)
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

      const batchExchange = await BatchExchange.new(2, feeDenominator, owlProxy.address)
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
    it("places order and verifys contract storage is updated correctly", async () => {
      const batchExchange = await setupGenericStableX()

      const currentStateIndex = await batchExchange.getCurrentBatchId()
      const id = await batchExchange.placeOrder.call(0, 1, 3, 10, 20, { from: user_1 })
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
      const id = await batchExchange.placeValidFromOrders.call([0], [1], [currentBatch], [3], [10], [20], { from: user_1 })

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
      const id = batchExchange.placeValidFromOrders.call(
        [0, 1],
        [1, 0],
        [currentBatch, currentBatch],
        [3, 4],
        [10, 11],
        [20, 21],
        { from: user_1 }
      )
      await batchExchange.placeValidFromOrders([0, 1], [1, 0], [currentBatch, currentBatch], [3, 4], [10, 11], [20, 21], {
        from: user_1,
      })

      for (let i = 1; i <= id; i++) {
        const orderResult = await batchExchange.orders.call(user_1, id)
        assert.equal(orderResult.priceDenominator.toNumber(), 20, `order ${i}: priceDenominator was stored incorrectly`)
        assert.equal(orderResult.priceNumerator.toNumber(), 10, `order ${i}: priceNumerator was stored incorrectly`)
        assert.equal(orderResult.sellToken.toNumber(), 1, `order ${i}: sellToken was stored incorrectly`)
        assert.equal(orderResult.buyToken.toNumber(), 0, `order ${i}: buyToken was stored incorrectly`)
        // Note that this order will be stored, but never valid. However, this can not affect the exchange in any maliciouis way!
        assert.equal(orderResult.validFrom.toNumber(), currentBatch, `order ${i}: validFrom was stored incorrectly`)
        assert.equal(orderResult.validUntil.toNumber(), 3, `order ${i}: validUntil was stored incorrectly`)
      }
    })
  })
  describe("cancelOrders()", () => {
    it("places orders, then cancels it and orders status", async () => {
      const batchExchange = await setupGenericStableX()

      const id = await batchExchange.placeOrder.call(0, 1, 3, 10, 20, { from: user_1 })
      await batchExchange.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const currentStateIndex = await batchExchange.getCurrentBatchId()
      await batchExchange.cancelOrders([id], { from: user_1 })
      assert.equal(
        (await batchExchange.orders.call(user_1, id)).validUntil.toNumber(),
        currentStateIndex.toNumber() - 1,
        "validUntil was stored incorrectly"
      )
    })
  })
  describe("freeStorageOfOrders()", () => {
    it("places a order, then cancels and deletes it", async () => {
      const batchExchange = await setupGenericStableX()

      const id = await sendTxAndGetReturnValue(batchExchange.placeOrder, 0, 1, 3, 10, 20)
      await batchExchange.cancelOrders([id])
      await waitForNSeconds(BATCH_TIME)
      await batchExchange.freeStorageOfOrders([id])

      assert.equal((await batchExchange.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const batchExchange = await setupGenericStableX()

      const currentStateIndex = await batchExchange.getCurrentBatchId()

      const id = await sendTxAndGetReturnValue(batchExchange.placeOrder, 0, 1, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(batchExchange.freeStorageOfOrders([id]), "Order is still valid")
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const batchExchange = await setupGenericStableX()
      const id = await sendTxAndGetReturnValue(batchExchange.placeOrder, 0, 1, 3, 10, 20)
      await batchExchange.cancelOrders([id])
      await truffleAssert.reverts(batchExchange.freeStorageOfOrders([id]), "Order is still valid")
    })
    it("deletes several orders successfully", async () => {
      const batchExchange = await setupGenericStableX()
      const id = await sendTxAndGetReturnValue(batchExchange.placeOrder, 0, 1, 3, 10, 20)
      const id2 = await sendTxAndGetReturnValue(batchExchange.placeOrder, 0, 1, 3, 10, 20)
      await batchExchange.cancelOrders([id, id2])
      await waitForNSeconds(BATCH_TIME)
      await batchExchange.freeStorageOfOrders([id, id2])
      assert.equal((await batchExchange.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
      assert.equal((await batchExchange.orders(user_1, id2)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
  })
  describe("submitSolution()", () => {
    it("rejects attempt at price scaling hack", async () => {
      const batchExchange = await setupGenericStableX()
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)

      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices.map(x => x.mul(new BN(2))),
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "fee token price must be 10^18"
      )
    })
    it("rejects if claimed objective is not better than current", async () => {
      const batchExchange = await setupGenericStableX()

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await closeAuction(batchExchange)

      await truffleAssert.reverts(
        batchExchange.submitSolution(batchIndex, 0, [], [], [], [], []),
        "Claimed objective is not more than current solution"
      )
    })
    it("rejects trivial solution (the only solution with zero utility)", async () => {
      const batchExchange = await setupGenericStableX()
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await closeAuction(batchExchange)
      const fakeClaimedObjective = 1
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchIndex, fakeClaimedObjective, [], [], [], [toETH(1)], [0], { from: solver }),
        "Solution must be better than trivial"
      )
    })
    it("[Basic Trade] places two orders and returns calculated utility", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const objectiveValue = await batchExchange.submitSolution.call(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert(objectiveValue > 0, "the computed objective value is greater than 0")
      assert.equal(objectiveValue, solution.objectiveValue.toString())
    })
    it("rejects competing solution with same objective value", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue.add(new BN(1)),
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: competingSolver }
        ),
        "Solution must have a higher objective value than current solution"
      )
    })
    it("[Basic Trade] places two orders and matches them in a solution with Utility > 0", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const volume = solution.volumes
      const prices = solution.prices
      const tokenIdsForPrice = solution.tokenIdsForPrice

      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      // TODO - make this general (no user_i, no feeToken and no erc20_2)
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        volume[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(),
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const volume = partialSolution.volumes
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      await batchExchange.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedOrderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      // TODO - make this more general(no user_i, etc...)
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        volume[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(),
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
        getExecutedSellAmount(volume[0], prices[1], prices[0]).toString(),
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
        getExecutedSellAmount(volume[1], prices[0], prices[1]).toString(),
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      // Solution shared values
      const owners = partialSolution.owners
      const touchedOrderIds = partialSolution.touchedOrderIds
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      // Submit partial Solution.
      const partialBuyVolumes = partialSolution.volumes
      await batchExchange.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        owners,
        touchedOrderIds,
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
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(partialBuyVolumes[0], prices[1], prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        partialBuyVolumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(partialBuyVolumes[1], prices[0], prices[1])).toString(),
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
        batchIndex,
        fullSolution.objectiveValue,
        owners,
        touchedOrderIds,
        fullBuyVolumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      assert((await batchExchange.getCurrentObjectiveValue.call()).eq(fullSolution.objectiveValue))

      // Note that full solution trade execution values have already been verified, but we want to make sure the contract reverted previous solution.
      assert.equal(
        (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
        basicTrade.deposits[0].amount.sub(getExecutedSellAmount(fullBuyVolumes[0], prices[1], prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        await batchExchange.getBalance.call(user_1, erc20_2),
        fullBuyVolumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
        basicTrade.deposits[1].amount.sub(getExecutedSellAmount(fullBuyVolumes[1], prices[0], prices[1])).toString(),
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

      const batchExchange = await BatchExchange.new(2, feeDenominator, owlProxy.address)
      const token = await MockContract.new()
      await owlProxy.approve(batchExchange.address, owlAmount)
      await batchExchange.addToken(token.address, { from: user_1 })

      // Ensure all user have sufficient feeToken
      for (const account of accounts) {
        await owlProxy.transfer(account, sufficientAmount, { from: user_1 })
        await owlProxy.approve(batchExchange.address, sufficientAmount, { from: account })
      }

      // First Auction
      const tradeExample = basicTrade
      await makeDeposits(batchExchange, accounts, tradeExample.deposits)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedOrderIds,
        partialSolution.volumes,
        partialSolution.prices,
        partialSolution.tokenIdsForPrice,
        { from: solver }
      )

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedOrderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: solver }
      )
      await closeAuction(batchExchange)

      // Second Auction
      const secondTradeExample = advancedTrade
      await makeDeposits(batchExchange, accounts, secondTradeExample.deposits)
      const nextBatchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const secondOrderIds = await placeOrders(batchExchange, accounts, secondTradeExample.orders, nextBatchIndex + 1)
      await closeAuction(batchExchange)

      const initialFeeTokenBalance = await owlProxy.balanceOf(batchExchange.address)
      const secondSolution = solutionSubmissionParams(secondTradeExample.solutions[0], accounts, secondOrderIds)
      // This is where the first auction's fees should be burned!
      await batchExchange.submitSolution(
        nextBatchIndex,
        secondSolution.objectiveValue,
        secondSolution.owners,
        secondSolution.touchedOrderIds,
        secondSolution.volumes,
        secondSolution.prices,
        secondSolution.tokenIdsForPrice,
        { from: solver }
      )
      const afterAuctionFeeTokenBalance = await owlProxy.balanceOf(batchExchange.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterAuctionFeeTokenBalance))

      // Better second solution
      const betterSolution = solutionSubmissionParams(secondTradeExample.solutions[1], accounts, secondOrderIds)
      // This is where the first auction's fees should be burned!
      await batchExchange.submitSolution(
        nextBatchIndex,
        betterSolution.objectiveValue,
        betterSolution.owners,
        betterSolution.touchedOrderIds,
        betterSolution.volumes,
        betterSolution.prices,
        betterSolution.tokenIdsForPrice,
        { from: solver }
      )
      const afterBetterSolutionFeeBalance = await owlProxy.balanceOf(batchExchange.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterBetterSolutionFeeBalance))
    })
    it("[Advanced Trade] verifies the 2nd solution is correctly documented and can be reverted by a 3rd", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, advancedTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, advancedTrade.orders, batchIndex + 1)

      await closeAuction(batchExchange)

      assert(advancedTrade.solutions.length >= 3, "This test must always run on a sequence of at least three solutions.")
      for (const solution of advancedTrade.solutions) {
        const { owners, touchedOrderIds, volumes, prices, tokenIdsForPrice } = solutionSubmissionParams(
          solution,
          accounts,
          orderIds
        )

        await batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          owners,
          touchedOrderIds,
          volumes,
          prices,
          tokenIdsForPrice,
          { from: solver }
        )
        // This is only really necessary for the third submission... but whateva.
        assert.equal(
          (await batchExchange.getBalance.call(user_1, feeToken)).toString(),
          advancedTrade.deposits[0].amount.sub(getExecutedSellAmount(volumes[0], prices[1], prices[0])).toString(),
          "Sold tokens were not adjusted correctly"
        )
        assert.equal(
          await batchExchange.getBalance.call(user_1, erc20_2),
          volumes[0].toString(),
          "Bought tokens were not adjusted correctly"
        )
        assert.equal(
          (await batchExchange.getBalance.call(user_2, erc20_2)).toString(),
          advancedTrade.deposits[1].amount.sub(getExecutedSellAmount(volumes[1], prices[0], prices[1])).toString(),
          "Sold tokens were not adjusted correctly"
        )
        assert.equal(
          await batchExchange.getBalance.call(user_2, feeToken),
          volumes[1].toString(),
          "Bought tokens were not adjusted correctly"
        )
      }
    })
    it("throws if the batchIndex is incorrect", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex - 1,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)

      const time_remaining = (await batchExchange.getSecondsRemainingInBatch()).toNumber()
      await waitForNSeconds(time_remaining + 241)

      const updatedBatchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Should be exactly one second past when solutions are being accepted.
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          updatedBatchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        // NOTE: This is different than usual tests!
        orderIds.push(
          (
            await sendTxAndGetReturnValue(
              batchExchange.placeValidFromOrders, // <------ Right here!
              [order.buyToken],
              [order.sellToken],
              [batchIndex + 1],
              [batchIndex + 2], // <------ and here!
              [order.buyAmount],
              [order.sellAmount],
              { from: accounts[order.user] }
            )
          )[0] // Because placeValidFromOrders returns a list of ids
        )
      }
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      // The orders placed aren't valid until next batch!
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      // NOTE: This is different than usual tests!             -------------->             v- Here -v
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex)
      await closeAuction(batchExchange)
      // Close another auction
      await waitForNSeconds(BATCH_TIME)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex + 1,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            batchExchange.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
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
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const badVolumes = solution.volumes.map(amt => amt.add(new BN(10)))

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          basicTrade.orders.map(x => x.buyAmount), // <----- THIS IS THE DIFFERENCE!
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Token conservation does not hold"
      )
    })
    it("throws, if sell volume is bigger than balance available", async () => {
      const batchExchange = await setupGenericStableX()

      for (const deposit of basicTrade.deposits) {
        const tokenAddress = await batchExchange.tokenIdToAddressMap.call(deposit.token)
        await batchExchange.deposit(tokenAddress, deposit.amount.sub(ERROR_EPSILON), { from: accounts[deposit.user] })
      }

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "SafeMath: subtraction overflow"
      )
    })
    it("reverts, if tokenIds for prices are not sorted", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          [0, 1, 1],
          { from: solver }
        ),
        "prices are not ordered by tokenId"
      )
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          [0, 2, 1],
          { from: solver }
        ),
        "prices are not ordered by tokenId"
      )
    })
    it("reverts, fee token not included in solution", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const badFeeTokenIdsForPrices = [1, 2]
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          badFeeTokenIdsForPrices,
          { from: solver }
        ),
        "fee token price has to be specified"
      )
    })
    it("reverts, if any prices are less than AMOUNT_MINIMUM", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const zeroPrices = [toETH(1), 0]

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallTradeData.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          1,
          accounts.slice(0, 2),
          orderIds,
          [tenThousand, tenThousand],
          [1, 0.9].map(toETH),
          [0, 1],
          { from: solver }
        ),
        "sell amount less than AMOUNT_MINIMUM"
      )
    })
    it("reverts if any buy amounts are less than AMOUNT_MINIMUM", async () => {
      const batchExchange = await setupGenericStableX()
      await makeDeposits(batchExchange, accounts, smallTradeData.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallTradeData.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const tooSmallBuyAmounts = [10000, 9990].map(val => new BN(val))
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          1,
          accounts.slice(0, 2),
          orderIds,
          tooSmallBuyAmounts,
          [1, 1].map(toETH),
          [0, 1],
          { from: solver }
        ),
        "buy amount less than AMOUNT_MINIMUM"
      )
    })
    it("checks that findPriceIndex also works, if it decreases the search bounds - all other tests only increase", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        [1, 2, 3, 4].map(toETH),
        [0, 1, 2, 3],
        { from: solver }
      )
    })
    it("grants fee surplus to solution submitter", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        partialSolution.owners,
        partialSolution.touchedOrderIds,
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
        batchIndex,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedOrderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: competingSolver }
      )

      assert.equal(0, await batchExchange.getBalance.call(solver, feeToken), "First submitter's reward was not reverted")
    })
    it("ensures credited tokens can't be withdrawn in same batch as solution submission", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      const relevantUser = accounts[basicTrade.orders[0].user]
      const buyToken = await batchExchange.tokenIdToAddressMap.call(basicTrade.orders[0].buyToken)

      // relevant user places withdraw request:
      await batchExchange.requestWithdraw(buyToken, 100, { from: relevantUser })

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(
        batchIndex + 1,
        (await batchExchange.lastCreditBatchId.call(relevantUser, buyToken)).toString(),
        "Last credited batch for touched buy token should be current batch"
      )
      await truffleAssert.reverts(
        batchExchange.withdraw(relevantUser, buyToken, { from: relevantUser }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("ensures credited feeToken reward can't be withdrawn in same batch as solution submission", async () => {
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      // solver places withdraw request:
      await batchExchange.requestWithdraw(feeToken, 100, { from: solver })

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(batchIndex + 1, (await batchExchange.lastCreditBatchId.call(solver, feeToken)).toString())
      await truffleAssert.reverts(
        batchExchange.withdraw(solver, feeToken, { from: solver }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("checks that the objective value is returned correctly after getting into a new batch", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const wayTooBigPrices = [toETH(1), "340282366920938463463374607431768211455"]
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
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

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const maxTouchedOrders = (await batchExchange.MAX_TOUCHED_ORDERS.call()).toNumber()

      const tooManyOwners = Array(maxTouchedOrders + 1).fill(user_1)
      await truffleAssert.reverts(
        batchExchange.submitSolution(batchIndex - 1, 1, tooManyOwners, [], [], [toETH(1)], [0]),
        "Solution exceeds MAX_TOUCHED_ORDERS"
      )
    })
    it("[Ring Trade] settles a ring trade between 3 tokens", async () => {
      const batchExchange = await setupGenericStableX(3)

      await makeDeposits(batchExchange, accounts, basicRingTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicRingTrade.orders, batchIndex + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicRingTrade.solutions[0], accounts, orderIds)
      const { prices, volumes } = solution

      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
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
          getExecutedSellAmount(volumes[i], prices[order.buyToken], prices[order.sellToken])
        )
        assert(sellTokenBalance.eq(expectedSellBalance), `Sold tokens were not adjusted correctly at order index ${i}`)
        assert(buyTokenBalance.eq(volumes[i]), `Bought tokens were not adjusted correctly at order index ${i}`)
      }
    })
    it("checks that currentPrices between different solutions are reset", async () => {
      const batchExchange = await setupGenericStableX(3)

      await makeDeposits(batchExchange, accounts, shortRingBetterTrade.deposits)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, shortRingBetterTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const ringSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        ringSolution.objectiveValue,
        ringSolution.owners,
        ringSolution.touchedOrderIds,
        ringSolution.volumes,
        ringSolution.prices,
        ringSolution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(
        ringSolution.prices[2].toString(),
        (await batchExchange.currentPrices.call(2)).toString(),
        "CurrentPrice were not adjusted correctly"
      )

      const directSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        directSolution.objectiveValue,
        directSolution.owners,
        directSolution.touchedOrderIds,
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
      // This test checks that we have met this "unless condition" and that our test is not failing due to temporarily negative balances
      const batchExchange = await setupGenericStableX()
      const feeToken = await batchExchange.tokenIdToAddressMap.call(0)
      const otherToken = await batchExchange.tokenIdToAddressMap.call(1)

      await makeDeposits(batchExchange, accounts, smallExample.deposits)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, smallExample.orders, batchIndex + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(smallExample.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
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
        smallExample.deposits[0].amount
          .sub(getExecutedSellAmount(solution.volumes[0], solution.prices[0], solution.prices[1]))
          .toString(),
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
        smallExample.deposits[3].amount
          .sub(getExecutedSellAmount(solution.volumes[3], solution.prices[1], solution.prices[0]))
          .toString(),
        "Sold tokens were not adjusted correctly"
      )
      // Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
      await truffleAssert.reverts(
        batchExchange.submitSolution(
          batchIndex,
          solution.objectiveValue + 1,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solution must have a higher objective value than current solution"
      )
    })
    it("partially fills orders in one auction and then fills them some more in the next.", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(batchExchange)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const prices = partialSolution.prices
      const owners = partialSolution.owners
      const touchedOrderIds = partialSolution.touchedOrderIds
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice
      // Fill 90% of these orders in first auction.
      await batchExchange.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        owners,
        touchedOrderIds,
        partialSolution.volumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      await waitForNSeconds(BATCH_TIME)
      // Fill essentially the remaining amount in
      const remainingBuyVolumes = [toETH(1), new BN("1998000000000000000")]
      // Note: The claimed objective value here is actually incorrect (but irrelevant for this test)
      batchExchange.submitSolution(batchIndex + 1, 1, owners, touchedOrderIds, remainingBuyVolumes, prices, tokenIdsForPrice, {
        from: solver,
      })

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
            .sub(getExecutedSellAmount(totalExecutedBuy, prices[order.buyToken], prices[order.sellToken]))
            .toString(),
          sellTokenBalance.toString(),
          `Sold tokens were not adjusted correctly ${i}`
        )
        assert.equal(totalExecutedBuy.toString(), buyTokenBalance.toString(), "Bought tokens were not adjusted correctly")
      }
    })
  })
  describe("getEncodedUserOrders()", async () => {
    it("returns null when there are no orders", async () => {
      const batchExchange = await setupGenericStableX()
      const auctionElements = await batchExchange.getEncodedAuctionElements()
      assert.equal(auctionElements, null)
    })
    it("returns correct orders whether valid, canceled or freed", async () => {
      const batchExchange = await setupGenericStableX()
      const zeroBN = new BN(0)
      const tenBN = new BN(10)
      const twentyBN = new BN(20)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const validOrderInfo = {
        user: user_1.toLowerCase(),
        sellTokenBalance: zeroBN,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchIndex,
        validUntil: batchIndex + 10,
        priceNumerator: twentyBN,
        priceDenominator: tenBN,
        remainingAmount: tenBN,
      }
      const canceledOrderInfo = {
        user: user_1.toLowerCase(),
        sellTokenBalance: zeroBN,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchIndex,
        validUntil: batchIndex - 1,
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

      await batchExchange.cancelOrders([0, 1])
      await waitForNSeconds(BATCH_TIME)
      await batchExchange.freeStorageOfOrders([1])

      const auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(JSON.stringify(auctionElements), JSON.stringify([canceledOrderInfo, freedOrderInfo, validOrderInfo]))
    })
  })
  describe("getEncodedAuctionElements()", async () => {
    it("returns all orders that are have ever been submitted", async () => {
      const batchExchange = await setupGenericStableX(3)
      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()

      const zeroBN = new BN(0)
      const tenBN = new BN(10)
      const orderInfo = [
        {
          user: user_1.toLowerCase(),
          sellTokenBalance: zeroBN,
          buyToken: 1,
          sellToken: 0,
          validFrom: batchIndex,
          validUntil: batchIndex,
          priceNumerator: new BN(20),
          priceDenominator: tenBN,
          remainingAmount: tenBN,
        },
        {
          user: user_2.toLowerCase(),
          sellTokenBalance: zeroBN,
          buyToken: 0,
          sellToken: 1,
          validFrom: batchIndex,
          validUntil: batchIndex,
          priceNumerator: new BN(500),
          priceDenominator: new BN(400),
          remainingAmount: new BN(400),
        },
      ]
      await batchExchange.placeOrder(1, 0, batchIndex, 20, 10, { from: user_1 })
      await batchExchange.placeOrder(0, 1, batchIndex, 500, 400, { from: user_2 })

      const auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(JSON.stringify(auctionElements), JSON.stringify(orderInfo))
    })
    it("credits balance when it's valid", async () => {
      const batchExchange = await setupGenericStableX(3)
      const erc20_1 = await batchExchange.tokenIdToAddressMap.call(1)
      const erc20_2 = await batchExchange.tokenIdToAddressMap.call(2)

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()

      await batchExchange.deposit(erc20_1, 8, { from: user_1 })
      await batchExchange.deposit(erc20_2, 20, { from: user_1 })
      await batchExchange.placeOrder(1, 2, batchIndex, 20, 10, { from: user_1 })

      let auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 0)

      await waitForNSeconds(BATCH_TIME)

      auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 20)
    })
    it("includes freed orders with empty fields", async () => {
      const batchExchange = await setupGenericStableX()

      const batchIndex = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(1, 0, batchIndex + 10, 20, 10)
      await batchExchange.cancelOrders([0])

      let auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await waitForNSeconds(BATCH_TIME)

      // Cancellation is active but not yet freed
      auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await batchExchange.freeStorageOfOrders([0])

      auctionElements = decodeAuctionElements(await batchExchange.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, 0)
    })
    it("returns empty list if there are no orders", async () => {
      const batchExchange = await setupGenericStableX()
      const auctionElements = await batchExchange.getEncodedAuctionElements()
      assert.equal(auctionElements, null)
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
