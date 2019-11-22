const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")
const TokenOWL = artifacts.require("TokenOWL")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

const BN = require("bn.js")
const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue,
  decodeAuctionElements
} = require("../utilities")

const {
  closeAuction
} = require("../../scripts/stablex/utilities.js")

const {
  toETH,
  getExecutedSellAmount,
  ERROR_EPSILON,
} = require("../resources/math")
const {
  solutionSubmissionParams,
  basicTrade,
  advancedTrade,
  basicRingTrade,
  shortRingBetterTrade,
  smallExample,
} = require("../resources/examples")
const {
  makeDeposits,
  placeOrders,
  setupGenericStableX,
} = require("./stablex_utils")

const feeDenominator = 1000 // fee is (1 / feeDenominator)

contract("StablecoinConverter", async (accounts) => {
  const solver = accounts.pop()
  const competingSolver = accounts.pop()
  const [user_1, user_2] = accounts

  let BATCH_TIME
  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)
    await StablecoinConverter.link(IterableAppendOnlySet, lib2.address)
    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })
  describe("addToken()", () => {
    it("feeToken is set by default", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(feeToken.address)).toNumber(), 0)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(0), feeToken.address)
    })
    it("Anyone can add tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const token_1 = await ERC20.new()
      await stablecoinConverter.addToken(token_1.address, { from: user_1 })

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(1), token_1.address)
      const token_2 = await ERC20.new()
      await stablecoinConverter.addToken(token_2.address, { from: user_2 })

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(2), token_2.address)
    })
    it("Rejects same token added twice", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const token = await ERC20.new()
      await stablecoinConverter.addToken(token.address)
      await truffleAssert.reverts(stablecoinConverter.addToken(token.address), "Token already registered")
    })
    it("No exceed max tokens", async () => {
      const feeToken = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      const stablecoinConverter = await StablecoinConverter.new(3, feeDenominator, feeToken.address)
      await stablecoinConverter.addToken((await ERC20.new()).address)
      await stablecoinConverter.addToken((await ERC20.new()).address)

      await truffleAssert.reverts(stablecoinConverter.addToken((await ERC20.new()).address), "Max tokens reached")
    })
    it("Burns 10 OWL when adding token", async () => {
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const owlAmount = toETH(10)

      await owlProxy.mintOWL(user_1, owlAmount)

      const stablecoinConverter = await StablecoinConverter.new(2, feeDenominator, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(stablecoinConverter.address, owlAmount)
      assert(owlAmount.eq(await owlProxy.balanceOf(user_1)))
      assert(owlAmount.eq(await owlProxy.allowance(user_1, stablecoinConverter.address)))

      await stablecoinConverter.addToken(token.address, { from: user_1 })
      assert((await owlProxy.balanceOf(user_1)).eq(new BN(0)))
    })
    it("throws if OWL is not burned", async () => {
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const owlAmount = toETH(10)

      const stablecoinConverter = await StablecoinConverter.new(2, feeDenominator, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(stablecoinConverter.address, owlAmount)
      assert(owlAmount.eq(await owlProxy.allowance.call(user_1, stablecoinConverter.address)))

      // reverts as owl balance is not sufficient
      await truffleAssert.reverts(stablecoinConverter.addToken(token.address, { from: user_1 }))
    })
  })
  describe("placeOrder()", () => {
    it("places order and verifys contract storage is updated correctly", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()
      const id = await stablecoinConverter.placeOrder.call(0, 1, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const orderResult = (await stablecoinConverter.orders.call(user_1, id))
      assert.equal((orderResult.priceDenominator).toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal((orderResult.priceNumerator).toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal((orderResult.sellToken).toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal((orderResult.buyToken).toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal((orderResult.validFrom).toNumber(), currentStateIndex.toNumber(), "validFrom was stored incorrectly")
      assert.equal((orderResult.validUntil).toNumber(), 3, "validUntil was stored incorrectly")
    })
  })
  describe("placeValidFromOrders()", () => {
    it("places single order with specified validFrom", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const id = await stablecoinConverter.placeValidFromOrders.call([0], [1], [20], [3], [10], [20], { from: user_1 })
      await stablecoinConverter.placeValidFromOrders([0], [1], [20], [3], [10], [20], { from: user_1 })
      const orderResult = (await stablecoinConverter.orders.call(user_1, id))
      assert.equal((orderResult.priceDenominator).toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal((orderResult.priceNumerator).toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal((orderResult.sellToken).toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal((orderResult.buyToken).toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal((orderResult.validFrom).toNumber(), 20, "validFrom was stored incorrectly")
      assert.equal((orderResult.validUntil).toNumber(), 3, "validUntil was stored incorrectly")
    })
    it("rejects orders with invalid array input", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await truffleAssert.fails(
        stablecoinConverter.placeValidFromOrders([0, 1], [1], [20], [3], [10], [20]),
        "invalid opcode"
      )
    })
    it("places multiple orders with sepcified validFrom", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const id = stablecoinConverter.placeValidFromOrders.call([0, 1], [1, 0], [20, 30], [3, 4], [10, 11], [20, 21], { from: user_1 })
      await stablecoinConverter.placeValidFromOrders([0, 1], [1, 0], [20, 30], [3, 4], [10, 11], [20, 21], { from: user_1 })

      for (let i = 1; i <= id; i++) {
        const orderResult = (await stablecoinConverter.orders.call(user_1, id))
        assert.equal((orderResult.priceDenominator).toNumber(), 20, `order ${i}: priceDenominator was stored incorrectly`)
        assert.equal((orderResult.priceNumerator).toNumber(), 10, `order ${i}: priceNumerator was stored incorrectly`)
        assert.equal((orderResult.sellToken).toNumber(), 1, `order ${i}: sellToken was stored incorrectly`)
        assert.equal((orderResult.buyToken).toNumber(), 0, `order ${i}: buyToken was stored incorrectly`)
        // Note that this order will be stored, but never valid. However, this can not affect the exchange in any maliciouis way!
        assert.equal((orderResult.validFrom).toNumber(), 20, `order ${i}: validFrom was stored incorrectly`)
        assert.equal((orderResult.validUntil).toNumber(), 3, `order ${i}: validUntil was stored incorrectly`)
      }
    })
  })
  describe("cancelOrders()", () => {
    it("places orders, then cancels it and orders status", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const id = await stablecoinConverter.placeOrder.call(0, 1, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()
      await stablecoinConverter.cancelOrders([id], { from: user_1 })
      assert.equal(
        ((await stablecoinConverter.orders.call(user_1, id)).validUntil).toNumber(),
        (currentStateIndex.toNumber() - 1),
        "validUntil was stored incorrectly"
      )
    })
  })
  describe("freeStorageOfOrder()", () => {
    it("places a order, then cancels and deletes it", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrders([id])
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder([id])

      assert.equal((await stablecoinConverter.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(
        stablecoinConverter.freeStorageOfOrder([id]),
        "Order is still valid"
      )
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrders([id])
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder([id]), "Order is still valid")
    })
    it("deletes several orders successfully", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      const id2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrders([id, id2])
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder([id, id2])
      assert.equal((await stablecoinConverter.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
      assert.equal((await stablecoinConverter.orders(user_1, id2)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
  })
  describe("submitSolution()", () => {
    it("rejects attempt at price scaling hack", async () => {
      const stablecoinConverter = await setupGenericStableX()
      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)

      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      await closeAuction(stablecoinConverter)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, 0, [], [], [], [], []),
        "Claimed objective is not more than current solution"
      )
    })
    it("rejects trivial solution (the only solution with zero utility)", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const zeroVolumes = Array(solution.volumes.length).fill(0)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          zeroVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solution must be better than trivial"
      )
      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert.equal(0, currentObjectiveValue)
    })
    it("[Basic Trade] places two orders and returns calculated utility", async () => {
      const stablecoinConverter = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const objectiveValue = await stablecoinConverter.submitSolution.call(
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
    it("[Basic Trade] places two orders and matches them in a solution with Utility > 0", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(1)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const volume = solution.volumes
      const prices = solution.prices
      const tokenIdsForPrice = solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(
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
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken)).toString(), basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2)), volume[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2)).toString(), basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken)), volume[1].toString(), "Bought tokens were not adjusted correctly")

      // This final assertion isn't really necessary here.
      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(currentObjectiveValue.toString(), solution.objectiveValue.toString())
    })
    it("[Basic Trade] places two orders, matches them partially and then checks correct order adjustments", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(1)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const volume = partialSolution.volumes
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(
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
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken)).toString(), basicTrade.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2)), volume[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2)).toString(), basicTrade.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken)), volume[1].toString(), "Bought tokens were not adjusted correctly")

      const orderResult1 = (await stablecoinConverter.orders.call(user_1, orderIds[0]))
      const orderResult2 = (await stablecoinConverter.orders.call(user_2, orderIds[1]))

      assert.equal(orderResult1.usedAmount, getExecutedSellAmount(volume[0], prices[1], prices[0]).toString(), "usedAmount was stored incorrectly")
      assert.equal(orderResult1.priceDenominator.toString(), basicTrade.orders[0].sellAmount.toString(), "priceDenominator was stored incorrectly")
      assert.equal(orderResult1.priceNumerator.toString(), basicTrade.orders[0].buyAmount.toString(), "priceNumerator was stored incorrectly")

      assert.equal(orderResult2.usedAmount, getExecutedSellAmount(volume[1], prices[0], prices[1]).toString(), "usedAmount was stored incorrectly")
      assert.equal(orderResult2.priceDenominator.toString(), basicTrade.orders[1].sellAmount.toString(), "priceDenominator was stored incorrectly")
      assert.equal(orderResult2.priceNumerator.toString(), basicTrade.orders[1].buyAmount.toString(), "priceNumerator was stored incorrectly")
    })
    it("[Basic Trade] places two orders, first matches them partially and then fully in a 2nd solution submission", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(1)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      // Solution shared values
      const owners = partialSolution.owners
      const touchedOrderIds = partialSolution.touchedOrderIds
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      // Submit partial Solution.
      const partialBuyVolumes = partialSolution.volumes
      await stablecoinConverter.submitSolution(
        batchIndex,
        partialSolution.objectiveValue,
        owners,
        touchedOrderIds,
        partialBuyVolumes,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      const partialObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(partialObjectiveValue.toString(), partialSolution.objectiveValue.toString())

      // Checks that contract updates the partial solution correctly as expected (only needs to be checked once)
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken)).toString(), basicTrade.deposits[0].amount.sub(getExecutedSellAmount(partialBuyVolumes[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2)), partialBuyVolumes[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2)).toString(), basicTrade.deposits[1].amount.sub(getExecutedSellAmount(partialBuyVolumes[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken)), partialBuyVolumes[1].toString(), "Bought tokens were not adjusted correctly")

      // Submit better (full) solution
      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const fullBuyVolumes = fullSolution.volumes
      await stablecoinConverter.submitSolution(batchIndex, fullSolution.objectiveValue, owners, touchedOrderIds, fullBuyVolumes, prices, tokenIdsForPrice, { from: solver })

      assert((await stablecoinConverter.getCurrentObjectiveValue.call()).eq(fullSolution.objectiveValue))

      // Note that full solution trade execution values have already been verified, but we want to make sure the contract reverted previous solution.
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken)).toString(), basicTrade.deposits[0].amount.sub(getExecutedSellAmount(fullBuyVolumes[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2)), fullBuyVolumes[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2)).toString(), basicTrade.deposits[1].amount.sub(getExecutedSellAmount(fullBuyVolumes[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken)), fullBuyVolumes[1].toString(), "Bought tokens were not adjusted correctly")
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

      const stablecoinConverter = await StablecoinConverter.new(2, feeDenominator, owlProxy.address)
      const token = await MockContract.new()
      await owlProxy.approve(stablecoinConverter.address, owlAmount)
      await stablecoinConverter.addToken(token.address, { from: user_1 })

      // Ensure all user have sufficient feeToken
      for (const account of accounts) {
        await owlProxy.transfer(account, sufficientAmount, { from: user_1 })
        await owlProxy.approve(stablecoinConverter.address, sufficientAmount, { from: account })
      }

      // First Auction
      const tradeExample = basicTrade
      await makeDeposits(stablecoinConverter, accounts, tradeExample.deposits)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await stablecoinConverter.submitSolution(batchIndex, partialSolution.objectiveValue, partialSolution.owners, partialSolution.touchedOrderIds, partialSolution.volumes, partialSolution.prices, partialSolution.tokenIdsForPrice, { from: solver })

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(batchIndex, fullSolution.objectiveValue, fullSolution.owners, fullSolution.touchedOrderIds, fullSolution.volumes, fullSolution.prices, fullSolution.tokenIdsForPrice, { from: solver })
      await closeAuction(stablecoinConverter)

      // Second Auction
      const secondTradeExample = advancedTrade
      await makeDeposits(stablecoinConverter, accounts, secondTradeExample.deposits)
      const nextBatchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const secondOrderIds = await placeOrders(stablecoinConverter, accounts, secondTradeExample.orders, nextBatchIndex + 1)
      await closeAuction(stablecoinConverter)

      const initialFeeTokenBalance = await owlProxy.balanceOf(stablecoinConverter.address)
      const secondSolution = solutionSubmissionParams(secondTradeExample.solutions[0], accounts, secondOrderIds)
      // This is where the first auction's fees should be burned!
      await stablecoinConverter.submitSolution(
        nextBatchIndex,
        secondSolution.objectiveValue,
        secondSolution.owners,
        secondSolution.touchedOrderIds,
        secondSolution.volumes,
        secondSolution.prices,
        secondSolution.tokenIdsForPrice,
        { from: solver })
      const afterAuctionFeeTokenBalance = await owlProxy.balanceOf(stablecoinConverter.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterAuctionFeeTokenBalance))

      // Better second solution
      const betterSolution = solutionSubmissionParams(secondTradeExample.solutions[1], accounts, secondOrderIds)
      // This is where the first auction's fees should be burned!
      await stablecoinConverter.submitSolution(
        nextBatchIndex,
        betterSolution.objectiveValue,
        betterSolution.owners,
        betterSolution.touchedOrderIds,
        betterSolution.volumes,
        betterSolution.prices,
        betterSolution.tokenIdsForPrice,
        { from: solver })
      const afterBetterSolutionFeeBalance = await owlProxy.balanceOf(stablecoinConverter.address)
      assert(initialFeeTokenBalance.sub(basicTrade.solutions[0].burntFees).eq(afterBetterSolutionFeeBalance))
    })
    it("[Advanced Trade] verifies the 2nd solution is correctly documented and can be reverted by a 3rd", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(1)

      await makeDeposits(stablecoinConverter, accounts, advancedTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, advancedTrade.orders, batchIndex + 1)

      await closeAuction(stablecoinConverter)

      assert(advancedTrade.solutions.length >= 3, "This test must always run on a sequence of at least three solutions.")
      for (const solution of advancedTrade.solutions) {
        const { owners, touchedOrderIds, volumes, prices, tokenIdsForPrice, } = solutionSubmissionParams(solution, accounts, orderIds)

        await stablecoinConverter.submitSolution(batchIndex, solution.objectiveValue, owners, touchedOrderIds, volumes, prices, tokenIdsForPrice, { from: solver })
        // This is only really necessary for the third submission... but whateva.
        assert.equal(
          (await stablecoinConverter.getBalance.call(user_1, feeToken)).toString(),
          advancedTrade.deposits[0].amount.sub(getExecutedSellAmount(volumes[0], prices[1], prices[0])).toString(),
          "Sold tokens were not adjusted correctly",
        )
        assert.equal(
          (await stablecoinConverter.getBalance.call(user_1, erc20_2)),
          volumes[0].toString(),
          "Bought tokens were not adjusted correctly"
        )
        assert.equal(
          (await stablecoinConverter.getBalance.call(user_2, erc20_2)).toString(),
          advancedTrade.deposits[1].amount.sub(getExecutedSellAmount(volumes[1], prices[0], prices[1])).toString(),
          "Sold tokens were not adjusted correctly"
        )
        assert.equal(
          (await stablecoinConverter.getBalance.call(user_2, feeToken)),
          volumes[1].toString(),
          "Bought tokens were not adjusted correctly"
        )
      }
    })
    it("throws if the batchIndex is incorrect", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)

      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)

      const time_remaining = (await stablecoinConverter.getSecondsRemainingInBatch()).toNumber()
      await waitForNSeconds(time_remaining + 241)

      const updatedBatchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Should be exactly one second past when solutions are being accepted.
      await truffleAssert.reverts(

        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        // NOTE: This is different than usual tests!
        orderIds.push(
          (await sendTxAndGetReturnValue(
            stablecoinConverter.placeValidFromOrders,  // <------ Right here!
            [order.buyToken],
            [order.sellToken],
            [batchIndex + 1],
            [batchIndex + 2],  // <------ and here!
            [order.buyAmount],
            [order.sellAmount],
            { from: accounts[order.user] }
          ))[0]  // Because placeValidFromOrders returns a list of ids
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      // The orders placed aren't valid until next batch!
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      // NOTE: This is different than usual tests!             -------------->             v- Here -v
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex)
      await closeAuction(stablecoinConverter)
      // Close another auction
      await waitForNSeconds(BATCH_TIME)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTrade.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount.add(ERROR_EPSILON),   // <------- NOTE THAT THIS IS DIFFERENT
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const badVolumes = solution.volumes.map(amt => amt.add(new BN(10)))

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          basicTrade.orders.map(x => x.buyAmount),  // <----- THIS IS THE DIFFERENCE!
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Token conservation does not hold"
      )
    })
    it("throws, if sell volume is bigger than balance available", async () => {
      const stablecoinConverter = await setupGenericStableX()

      for (const deposit of basicTrade.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount.sub(ERROR_EPSILON), { from: accounts[deposit.user] })
      }

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const badFeeTokenIdsForPrices = [1, 2]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
    it("reverts, if price of sellToken == 0", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const zeroPrices = [toETH(1), 0]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.objectiveValue,
          solution.owners,
          solution.touchedOrderIds,
          solution.volumes,
          zeroPrices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "prices are not allowed to be zero"
      )
    })
    it("checks that findPriceIndex also works, if it decreases the search bounds - all other tests only increase", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
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
        await stablecoinConverter.getBalance.call(solver, feeToken),
        "fees weren't allocated as expected correctly"
      )
    })
    it("ensures fee deducted from previous submitter, when better solution is submitted", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      await stablecoinConverter.submitSolution(
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
        await stablecoinConverter.getBalance.call(solver, feeToken),
        "fees weren't allocated as expected correctly"
      )

      const fullSolution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        fullSolution.objectiveValue,
        fullSolution.owners,
        fullSolution.touchedOrderIds,
        fullSolution.volumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: competingSolver }
      )

      assert.equal(0, await stablecoinConverter.getBalance.call(solver, feeToken), "First submitter's reward was not reverted")
    })
    it("ensures credited tokens can't be withdrawn in same batch as solution submission", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      const relevantUser = accounts[basicTrade.orders[0].user]
      const buyToken = await stablecoinConverter.tokenIdToAddressMap.call(basicTrade.orders[0].buyToken)

      // relevant user places withdraw request:
      await stablecoinConverter.requestWithdraw(buyToken, 100, { from: relevantUser })

      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
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
        (await stablecoinConverter.lastCreditBatchId.call(relevantUser, buyToken)).toString(),
        "Last credited batch for touched buy token should be current batch"
      )
      await truffleAssert.reverts(
        stablecoinConverter.withdraw(relevantUser, buyToken, { from: relevantUser }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("ensures credited feeToken reward can't be withdrawn in same batch as solution submission", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      // solver places withdraw request:
      await stablecoinConverter.requestWithdraw(feeToken, 100, { from: solver })

      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(batchIndex + 1, (await stablecoinConverter.lastCreditBatchId.call(solver, feeToken)).toString())
      await truffleAssert.reverts(
        stablecoinConverter.withdraw(solver, feeToken, { from: solver }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("checks that the objective value is returned correctly after getting into a new batch", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      await closeAuction(stablecoinConverter)
      assert.equal(0, await stablecoinConverter.getCurrentObjectiveValue.call(), "Objective value is not returned correct")
    })
    it("reverts, if downcast from u256 to u128 would change the value", async () => {
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)
      const wayTooBigPrices = [toETH(1), "340282366920938463463374607431768211455"]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const maxTouchedOrders = (await stablecoinConverter.MAX_TOUCHED_ORDERS.call()).toNumber()

      const tooManyOwners = Array(maxTouchedOrders + 1).fill(user_1)
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, 1, tooManyOwners, [], [], [toETH(1)], [0]),
        "Solution exceeds MAX_TOUCHED_ORDERS"
      )
    })
    it("[Ring Trade] settles a ring trade between 3 tokens", async () => {
      const stablecoinConverter = await setupGenericStableX(3)

      await makeDeposits(stablecoinConverter, accounts, basicRingTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicRingTrade.orders, batchIndex + 1)

      await closeAuction(stablecoinConverter)
      const solution = solutionSubmissionParams(basicRingTrade.solutions[0], accounts, orderIds)
      const { prices, volumes } = solution

      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        volumes,
        prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert((await stablecoinConverter.getCurrentObjectiveValue.call()).eq(solution.objectiveValue))

      // NOTE that orders.length = deposits.length
      assert(basicRingTrade.orders.length == basicRingTrade.deposits.length)
      for (let i = 0; i < basicRingTrade.orders.length; i++) {
        const deposit = basicRingTrade.deposits[i]
        const order = basicRingTrade.orders[i]

        const buyToken = await stablecoinConverter.tokenIdToAddressMap.call(order.buyToken)
        const sellToken = await stablecoinConverter.tokenIdToAddressMap.call(order.sellToken)
        const relevantUser = accounts[order.user]

        const sellTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, sellToken)
        const buyTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, buyToken)

        const expectedSellBalance = deposit.amount.sub(getExecutedSellAmount(volumes[i], prices[order.buyToken], prices[order.sellToken]))
        assert(
          sellTokenBalance.eq(expectedSellBalance),
          `Sold tokens were not adjusted correctly at order index ${i}`
        )
        assert(buyTokenBalance.eq(volumes[i]), `Bought tokens were not adjusted correctly at order index ${i}`)
      }
    })
    it("checks that currentPrices between different solutions are reset", async () => {
      const stablecoinConverter = await setupGenericStableX(3)

      await makeDeposits(stablecoinConverter, accounts, shortRingBetterTrade.deposits)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, shortRingBetterTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const ringSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        ringSolution.objectiveValue,
        ringSolution.owners,
        ringSolution.touchedOrderIds,
        ringSolution.volumes,
        ringSolution.prices,
        ringSolution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(ringSolution.prices[2].toString(), (await stablecoinConverter.currentPrices.call(2)).toString(), "CurrentPrice were not adjusted correctly")

      const directSolution = solutionSubmissionParams(shortRingBetterTrade.solutions[1], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        directSolution.objectiveValue,
        directSolution.owners,
        directSolution.touchedOrderIds,
        directSolution.volumes,
        directSolution.prices,
        directSolution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(0, (await stablecoinConverter.currentPrices.call(2)).toString(), "CurrentPrice were not adjusted correctly")
    })
    it("checks that solution trades are deleted even if balances get temporarily negative while reverting ", async () => {
      // The following test, a user_2 will receive some tokens and sell these received tokens in one batch.
      // If this batch-trade gets executed and later reverted by another trade, users_2's balance would be temporarily negative, unless
      // in the settlement and reversion not all buyAmounts will be credited first, before the sellAmounts are subtracted.
      // This test checks that we have met this "unless condition" and that our test is not failing due to temporarily negative balances
      const stablecoinConverter = await setupGenericStableX()
      const feeToken = await stablecoinConverter.tokenIdToAddressMap.call(0)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(1)

      await makeDeposits(stablecoinConverter, accounts, smallExample.deposits)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, smallExample.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const solution = solutionSubmissionParams(smallExample.solutions[0], accounts, orderIds)
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.objectiveValue,
        solution.owners,
        solution.touchedOrderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      const users = smallExample.deposits.map(d => accounts[d.user])

      assert.equal(
        (await stablecoinConverter.getBalance.call(users[0], feeToken)).toString(),
        smallExample.deposits[0].amount.sub(getExecutedSellAmount(solution.volumes[0], solution.prices[0], solution.prices[1])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[0], feeToken)).toString(),
        smallExample.deposits[0].amount.sub(getExecutedSellAmount(solution.volumes[0], solution.prices[0], solution.prices[1])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[1], feeToken)),
        0,
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[2], feeToken)).toString(),
        solution.volumes[3].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[0], erc20_2)).toString(),
        solution.volumes[0].toString(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[1], erc20_2)),
        0,
        "Bought and sold tokens were not adjusted correctly"
      )
      assert.equal(
        (await stablecoinConverter.getBalance.call(users[2], erc20_2)).toString(),
        smallExample.deposits[2].amount.sub(getExecutedSellAmount(solution.volumes[3], solution.prices[1], solution.prices[0])).toString(),
        "Sold tokens were not adjusted correctly"
      )
      // Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
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
      const stablecoinConverter = await setupGenericStableX()

      await makeDeposits(stablecoinConverter, accounts, basicTrade.deposits)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(stablecoinConverter, accounts, basicTrade.orders, batchIndex + 1)
      await closeAuction(stablecoinConverter)

      const partialSolution = solutionSubmissionParams(basicTrade.solutions[1], accounts, orderIds)
      const prices = partialSolution.prices
      const owners = partialSolution.owners
      const touchedOrderIds = partialSolution.touchedOrderIds
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice
      // Fill 90% of these orders in first auction.
      await stablecoinConverter.submitSolution(batchIndex, partialSolution.objectiveValue, owners, touchedOrderIds, partialSolution.volumes, prices, tokenIdsForPrice, { from: solver })

      await waitForNSeconds(BATCH_TIME)
      // Fill essentially the remaining amount in 
      const remainingBuyVolumes = [toETH(1), new BN("1998000000000000000")]
      // Note: The claimed objective value here is actually incorrect (but irrelevant for this test)
      stablecoinConverter.submitSolution(batchIndex + 1, 1, owners, touchedOrderIds, remainingBuyVolumes, prices, tokenIdsForPrice, { from: solver })

      assert(basicTrade.orders.length == basicTrade.deposits.length)
      for (let i = 0; i < basicTrade.orders.length; i++) {
        const deposit = basicTrade.deposits[i]
        const order = basicTrade.orders[i]

        const buyToken = await stablecoinConverter.tokenIdToAddressMap.call(order.buyToken)
        const sellToken = await stablecoinConverter.tokenIdToAddressMap.call(order.sellToken)
        const relevantUser = accounts[order.user]

        const sellTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, sellToken)
        const buyTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, buyToken)
        const totalExecutedBuy = partialSolution.volumes[i].add(remainingBuyVolumes[i])

        assert.equal(
          deposit.amount.sub(getExecutedSellAmount(totalExecutedBuy, prices[order.buyToken], prices[order.sellToken])).toString(),
          sellTokenBalance.toString(),
          `Sold tokens were not adjusted correctly ${i}`
        )
        assert.equal(totalExecutedBuy.toString(), buyTokenBalance.toString(), "Bought tokens were not adjusted correctly")
      }
    })
  })
  describe("getEncodedAuctionElements()", async () => {
    it("returns all orders that are have ever been submitted", async () => {
      const stablecoinConverter = await setupGenericStableX(3)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      await stablecoinConverter.placeOrder(1, 0, batchIndex, 20, 10, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, batchIndex + 10, 500, 400, { from: user_2 })

      const auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 2)
      assert.deepEqual(auctionElements[0], {
        user: user_1.toLowerCase(),
        sellTokenBalance: 0,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchIndex,
        validUntil: batchIndex,
        priceNumerator: 20,
        priceDenominator: 10,
        remainingAmount: 10,
      })
      assert.deepEqual(auctionElements[1], {
        user: user_2.toLowerCase(),
        sellTokenBalance: 0,
        buyToken: 0,
        sellToken: 1,
        validFrom: batchIndex,
        validUntil: batchIndex + 10,
        priceNumerator: 500,
        priceDenominator: 400,
        remainingAmount: 400,
      })
    })
    it("credits balance when it's valid", async () => {
      const stablecoinConverter = await setupGenericStableX(3)
      const erc20_1 = await stablecoinConverter.tokenIdToAddressMap.call(1)
      const erc20_2 = await stablecoinConverter.tokenIdToAddressMap.call(2)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      await stablecoinConverter.deposit(erc20_1, 8, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(1, 2, batchIndex, 20, 10, { from: user_1 })

      let auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 0)

      await waitForNSeconds(BATCH_TIME)

      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 20)
    })
    it("includes freed orders with empty fields", async () => {
      const stablecoinConverter = await setupGenericStableX()

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      await stablecoinConverter.placeOrder(1, 0, batchIndex + 10, 20, 10)
      stablecoinConverter.cancelOrders([0])

      let auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await waitForNSeconds(BATCH_TIME)

      // Cancellation is active but not yet freed
      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await stablecoinConverter.freeStorageOfOrder([0])

      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, 0)
    })
    it("returns empty list if there are no orders", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const auctionElements = await stablecoinConverter.getEncodedAuctionElements()
      assert.equal(auctionElements, null)
    })
  })
  describe("hasToken()", async () => {
    it("returns whether token was already added", async () => {
      const stablecoinConverter = await setupGenericStableX()
      const erc20_1 = await MockContract.new()
      assert.equal(await stablecoinConverter.hasToken.call(erc20_1.address), false)
      await stablecoinConverter.addToken(erc20_1.address)

      assert.equal(await stablecoinConverter.hasToken.call(erc20_1.address), true)
    })
  })
})
