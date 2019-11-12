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
} = require("./utilities.js")

const {
  toETH,
  basicTradeCase,
  advancedTradeCase,
  getExecutedSellAmount,
  basicRingTradeCase,
  shortRingBetterTradeCase
} = require("./resources/auction_examples.js")

const MAX_ERROR = new BN("999000")
const feeDenominator = 1000 // fee is (1 / feeDenominator)

contract("StablecoinConverter", async (accounts) => {
  const solver = accounts.pop()
  const competingSolver = accounts.pop()
  const [user_1, user_2] = accounts

  let BATCH_TIME
  before(async () => {
    const feeToken = await MockContract.new()
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)
    await StablecoinConverter.link(IterableAppendOnlySet, lib2.address)
    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })

  describe("placeOrder()", () => {
    it("places Orders and checks parameters", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

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
  describe("placeValidFromOrder()", () => {
    it("places order with sepcified validFrom", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const id = await stablecoinConverter.placeValidFromOrder.call(0, 1, 20, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeValidFromOrder(0, 1, 20, 3, 10, 20, { from: user_1 })
      const orderResult = (await stablecoinConverter.orders.call(user_1, id))
      assert.equal((orderResult.priceDenominator).toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal((orderResult.priceNumerator).toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal((orderResult.sellToken).toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal((orderResult.buyToken).toNumber(), 0, "buyToken was stored incorrectly")
      // Note that this order will be stored, but never valid. However, this can not affect the exchange in any maliciouis way!
      assert.equal((orderResult.validFrom).toNumber(), 20, "validFrom was stored incorrectly")
      assert.equal((orderResult.validUntil).toNumber(), 3, "validUntil was stored incorrectly")
    })
  })
  describe("cancelOrder()", () => {
    it("places orders, then cancels it and orders status", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const id = await stablecoinConverter.placeOrder.call(0, 1, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, 3, 10, 20, { from: user_1 })
      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()
      await stablecoinConverter.cancelOrder(id, { from: user_1 })
      assert.equal(
        ((await stablecoinConverter.orders.call(user_1, id)).validUntil).toNumber(),
        (currentStateIndex.toNumber() - 1),
        "validUntil was stored incorrectly"
      )

    })
  })
  describe("freeStorageOfOrder()", () => {
    it("places a order, then cancels and deletes it", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder([id])

      assert.equal((await stablecoinConverter.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(
        stablecoinConverter.freeStorageOfOrder([id]),
        "Order is still valid"
      )
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder([id]), "Order is still valid")
    })
    it("deletes several orders successfully", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      const id2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id2)
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder([id, id2])
      assert.equal((await stablecoinConverter.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
      assert.equal((await stablecoinConverter.orders(user_1, id2)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
  })
  describe("addToken()", () => {
    it("feeToken is set by default", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(feeToken.address)).toNumber(), 0)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(0), feeToken.address)
    })

    it("Anyone can add tokens", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const token_1 = await ERC20.new()
      await stablecoinConverter.addToken(token_1.address)

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(1), token_1.address)
      const token_2 = await ERC20.new()
      await stablecoinConverter.addToken(token_2.address)

      assert.equal((await stablecoinConverter.tokenAddressToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await stablecoinConverter.tokenIdToAddressMap.call(2), token_2.address)
    })

    it("Rejects same token added twice", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const token = await ERC20.new()
      await stablecoinConverter.addToken(token.address)
      await truffleAssert.reverts(stablecoinConverter.addToken(token.address), "Token already registered")
    })

    it("No exceed max tokens", async () => {
      const feeToken = await MockContract.new()
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
      const owlAmount = (10 * 10 ** (await owlProxy.decimals.call())).toString()

      await owlProxy.mintOWL(user_1, owlAmount)

      const stablecoinConverter = await StablecoinConverter.new(2, feeDenominator, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(stablecoinConverter.address, owlAmount)
      assert.equal(await owlProxy.balanceOf.call(user_1), owlAmount)
      assert.equal(await owlProxy.allowance.call(user_1, stablecoinConverter.address), owlAmount)

      await stablecoinConverter.addToken(token.address, { from: user_1 })
      assert.equal(await owlProxy.balanceOf.call(user_1), 0)
    })

    it("throws, if fees are not burned", async () => {
      const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
      const owlToken = await TokenOWL.new()
      const owlProxyContract = await TokenOWLProxy.new(owlToken.address)
      const owlProxy = await TokenOWL.at(owlProxyContract.address)
      await owlProxy.setMinter(user_1)
      const owlAmount = (10 * 10 ** (await owlProxy.decimals.call())).toString()


      const stablecoinConverter = await StablecoinConverter.new(2, feeDenominator, owlProxy.address)
      const token = await ERC20.new()
      await owlProxy.approve(stablecoinConverter.address, owlAmount)
      assert.equal(await owlProxy.allowance.call(user_1, stablecoinConverter.address), owlAmount)

      // reverts as owl balance is not sufficient
      await truffleAssert.reverts(stablecoinConverter.addToken(token.address, { from: user_1 }))
    })

  })
  describe("submitSolution()", () => {
    it("rejects trivial solution (the only solution with zero utility)", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const tradeSolution = basicTradeCase.solutions[0]
      const zeroVolumes = Array(tradeSolution.buyVolumes.length).fill(0)

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          tradeSolution.owners.map(x => accounts[x]),
          orderIds,
          zeroVolumes,
          tradeSolution.prices,
          tradeSolution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solution must be better than trivial"
      )
      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert.equal(0, currentObjectiveValue)
    })
    it("[Basic Trade] places two orders and matches them in a solution with Utility > 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const tradeSolution = basicTradeCase.solutions[0]
      const volume = tradeSolution.buyVolumes
      const prices = tradeSolution.prices
      const tokenIdsForPrice = tradeSolution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(
        batchIndex,
        tradeSolution.owners.map(x => accounts[x]),
        orderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toString(), basicTradeCase.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)), volume[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toString(), basicTradeCase.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)), volume[1].toString(), "Bought tokens were not adjusted correctly")

      // This final assertion isn't really necessary here.
      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(currentObjectiveValue.toString(), tradeSolution.objectiveValue.toString())
    })
    it("[Basic Trade] places two orders, matches them partially and then checks correct order adjustments", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const partialSolution = basicTradeCase.solutions[1]
      const volume = partialSolution.buyVolumes
      const prices = partialSolution.prices
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(
        batchIndex,
        partialSolution.owners.map(x => accounts[x]),
        orderIds,
        volume,
        prices,
        tokenIdsForPrice,
        { from: solver }
      )

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toString(), basicTradeCase.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)), volume[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toString(), basicTradeCase.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)), volume[1].toString(), "Bought tokens were not adjusted correctly")

      const orderResult1 = (await stablecoinConverter.orders.call(user_1, orderIds[0]))
      const orderResult2 = (await stablecoinConverter.orders.call(user_2, orderIds[1]))

      assert.equal(orderResult1.usedAmount, getExecutedSellAmount(volume[0], prices[1], prices[0]).toString(), "usedAmount was stored incorrectly")
      assert.equal(orderResult1.priceDenominator.toString(), basicTradeCase.orders[0].sellAmount.toString(), "priceDenominator was stored incorrectly")
      assert.equal(orderResult1.priceNumerator.toString(), basicTradeCase.orders[0].buyAmount.toString(), "priceNumerator was stored incorrectly")

      assert.equal(orderResult2.usedAmount, getExecutedSellAmount(volume[1], prices[0], prices[1]).toString(), "usedAmount was stored incorrectly")
      assert.equal(orderResult2.priceDenominator.toString(), basicTradeCase.orders[1].sellAmount.toString(), "priceDenominator was stored incorrectly")
      assert.equal(orderResult2.priceNumerator.toString(), basicTradeCase.orders[1].buyAmount.toString(), "priceNumerator was stored incorrectly")
    })
    it("[Basic Trade] places two orders, first matches them partially and then fully in a 2nd solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const partialSolution = basicTradeCase.solutions[1]
      // Solution shared values
      const prices = partialSolution.prices
      const owners = partialSolution.owners.map(x => accounts[x])
      const tokenIdsForPrice = partialSolution.tokenIdsForPrice

      // Submit partial Solution.
      const partialBuyVolumes = partialSolution.buyVolumes
      await stablecoinConverter.submitSolution(batchIndex, owners, orderIds, partialBuyVolumes, prices, tokenIdsForPrice, { from: solver })

      const partialObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(partialObjectiveValue.toString(), partialSolution.objectiveValue.toString())

      // Checks that contract updates the partial solution correctly as expected (only needs to be checked once)
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toString(), basicTradeCase.deposits[0].amount.sub(getExecutedSellAmount(partialBuyVolumes[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)), partialBuyVolumes[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toString(), basicTradeCase.deposits[1].amount.sub(getExecutedSellAmount(partialBuyVolumes[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)), partialBuyVolumes[1].toString(), "Bought tokens were not adjusted correctly")

      // Submit Full (Better) solution
      const fullSolution = basicTradeCase.solutions[0]
      const fullBuyVolumes = fullSolution.buyVolumes
      await stablecoinConverter.submitSolution(batchIndex, owners, orderIds, fullBuyVolumes, prices, tokenIdsForPrice, { from: solver })

      const fullObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(fullObjectiveValue.toString(), fullSolution.objectiveValue.toString())

      // Note that full solution trade execution values have already been verified, but we want to make sure the contract reverted previous solution.
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toString(), basicTradeCase.deposits[0].amount.sub(getExecutedSellAmount(fullBuyVolumes[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)), fullBuyVolumes[0].toString(), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toString(), basicTradeCase.deposits[1].amount.sub(getExecutedSellAmount(fullBuyVolumes[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)), fullBuyVolumes[1].toString(), "Bought tokens were not adjusted correctly")
    })
    it("[Advanced Trade] verifies the 2nd solution is correctly documented and can be reverted by a 3rd", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of advancedTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of advancedTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      assert(advancedTradeCase.solutions.length >= 3, "This test must always run on a sequence of at least three solutions.")
      for (const solution of advancedTradeCase.solutions) {
        const prices = solution.prices
        const owners = solution.owners.map(x => accounts[x])
        const volume = solution.buyVolumes
        const tokenIdsForPrice = solution.tokenIdsForPrice
        await stablecoinConverter.submitSolution(
          batchIndex,
          owners,
          orderIds,
          volume,
          prices,
          tokenIdsForPrice,
          { from: solver }
        )
        // This is only really necessary for the third submission... but whateva.
        assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toString(), basicTradeCase.deposits[0].amount.sub(getExecutedSellAmount(volume[0], prices[1], prices[0])).toString(), "Sold tokens were not adjusted correctly")
        assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)), volume[0].toString(), "Bought tokens were not adjusted correctly")
        assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toString(), basicTradeCase.deposits[1].amount.sub(getExecutedSellAmount(volume[1], prices[0], prices[1])).toString(), "Sold tokens were not adjusted correctly")
        assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)), volume[1].toString(), "Bought tokens were not adjusted correctly")
      }
    })
    it("throws, if the batchIndex is incorrect", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]

      // Correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex - 1,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("[Basic Trade] rejects solution submission after 4 minute deadline is over", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      const time_remaining = (await stablecoinConverter.getSecondsRemainingInBatch()).toNumber()
      await waitForNSeconds(time_remaining + 241)

      const solution = basicTradeCase.solutions[0]

      // Should be exactly one second past when solutions are being accepted.
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("[Basic Trade] throws, if order(s) not yet valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        // NOTE: This is different than usual tests!
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeValidFromOrder,  // <------ Right here!
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            batchIndex + 2,  // <------ and here!
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      // The orders placed aren't valid until next batch!
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Order is invalid"
      )
    })
    it("throws, if order is no longer valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        // NOTE: This is different than usual tests!
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,  // <------ Right here!
            order.buyToken,
            order.sellToken,
            batchIndex,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      // Close another auction
      await waitForNSeconds(BATCH_TIME)

      const solution = basicTradeCase.solutions[0]
      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex + 1,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Order is invalid"
      )
    })
    it("throws, if limit price is not met for an order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount.add(MAX_ERROR),   // <------- NOTE THAT THIS IS DIFFERENT
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "limit price not satisfied"
      )
    })
    it("throws, if sell volume is bigger than amount specified in the order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]

      const badVolumes = solution.buyVolumes.map(amt => amt.add(new BN(10)))

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          badVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "executedSellAmount bigger than specified in order"
      )
    })
    it("throws, if token conservation does not hold", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const solution = basicTradeCase.solutions[0]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          basicTradeCase.orders.map(x => x.buyAmount),  // <----- THIS IS THE DIFFERENCE!
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Token conservation does not hold"
      )
    })
    it("throws, if sell volume is bigger than balance available", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount.sub(MAX_ERROR), { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "SafeMath: subtraction overflow"
      )
    })
    it("reverts, if tokenIds for prices are not sorted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const solution = basicTradeCase.solutions[0]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          [0, 1, 1],
          { from: solver }
        ),
        "prices are not ordered by tokenId"
      )
    })
    it("reverts, fee token not included in solution", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)

      const solution = basicTradeCase.solutions[0]
      const badFeeTokenIdsForPrices = [1, 2]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          solution.prices,
          badFeeTokenIdsForPrices,
          { from: solver }
        ),
        "fee token price has to be specified"
      )
    })
    it("reverts, if price of sellToken == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      const zeroPrices = [0, 0]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          zeroPrices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "prices are not allowed to be zero"
      )
    })
    it("checks that findPriceIndex also works, if it decreases the search bounds - all other tests only increase", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]

      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.owners.map(x => accounts[x]),
        orderIds,
        solution.buyVolumes,
        [1, 2, 3, 4].map(toETH),
        [0, 1, 2, 3],
        { from: solver }
      )
    })
    it("grants fee surplus to solution submitter", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.owners.map(x => accounts[x]),
        orderIds,
        solution.buyVolumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(
        solution.burntFees.toString(),
        await stablecoinConverter.getBalance.call(solver, feeToken.address),
        "fees weren't allocated as expected correctly"
      )
    })
    it("ensures fee deducted from previous submitter, when better solution is submitted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const partialSolution = basicTradeCase.solutions[1]
      await stablecoinConverter.submitSolution(
        batchIndex,
        partialSolution.owners.map(x => accounts[x]),
        orderIds,
        partialSolution.buyVolumes,
        partialSolution.prices,
        partialSolution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(
        partialSolution.burntFees.toString(),
        await stablecoinConverter.getBalance.call(solver, feeToken.address),
        "fees weren't allocated as expected correctly"
      )

      const fullSolution = basicTradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        fullSolution.owners.map(x => accounts[x]),
        orderIds,
        fullSolution.buyVolumes,
        fullSolution.prices,
        fullSolution.tokenIdsForPrice,
        { from: competingSolver }
      )
      assert.equal(0, await stablecoinConverter.getBalance.call(solver, feeToken.address), "fee (for first submitter) was not reverted")
    })
    it("ensures credited tokens can't be withdrawn in same batch as solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      const relevantUser = accounts[basicTradeCase.orders[0].user]
      const buyToken = await stablecoinConverter.tokenIdToAddressMap.call(basicTradeCase.orders[0].buyToken)

      // relevant Userplaces withdraw request:
      await stablecoinConverter.requestWithdraw(buyToken, 100, { from: relevantUser })

      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.owners.map(x => accounts[x]),
        orderIds,
        solution.buyVolumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(
        batchIndex + 1,
        await stablecoinConverter.lastCreditBatchId.call(relevantUser, buyToken),
        "Last credited batch for touched buy token should be current batch"
      )
      await truffleAssert.reverts(
        stablecoinConverter.withdraw(relevantUser, buyToken, { from: relevantUser }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("ensures credited feeToken reward can't be withdrawn in same batch as solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      // solver places withdraw request:
      await stablecoinConverter.requestWithdraw(feeToken.address, 100, { from: solver })

      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.owners.map(x => accounts[x]),
        orderIds,
        solution.buyVolumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      assert.equal(
        (batchIndex + 1).toString(),
        (await stablecoinConverter.lastCreditBatchId.call(solver, feeToken.address)).toString()
      )
      await truffleAssert.reverts(
        stablecoinConverter.withdraw(solver, feeToken.address, { from: solver }),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
    it("checks that the objective value is returned correctly after getting into a new batch", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        solution.owners.map(x => accounts[x]),
        orderIds,
        solution.buyVolumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      await closeAuction(stablecoinConverter)
      assert.equal(0, await stablecoinConverter.getCurrentObjectiveValue.call(), "Objective value is not returned correct")
    })
    it("reverts, if downcast from u256 to u128 would change the value", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      // Make deposits
      for (const deposit of basicTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicTradeCase.solutions[0]
      const wayTooBigPrices = [toETH(1), "340282366920938463463374607431768211455"]
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(
          batchIndex,
          solution.owners.map(x => accounts[x]),
          orderIds,
          solution.buyVolumes,
          wayTooBigPrices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "SafeCast: value doesn't fit in 128 bits"
      )
    })
    it("reverts if max touched orders is exceeded", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const maxTouchedOrders = (await stablecoinConverter.MAX_TOUCHED_ORDERS.call()).toNumber()

      const tooManyOwners = Array(maxTouchedOrders + 1).fill(user_1)
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, tooManyOwners, [], [], [toETH(1)], [0]),
        "Solution exceeds MAX_TOUCHED_ORDERS"
      )
    })
    it("[Ring Trade] settles a ring trade between 3 tokens", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      // Make deposits
      for (const deposit of basicRingTradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of basicRingTradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const solution = basicRingTradeCase.solutions[0]
      const volume = solution.buyVolumes
      const prices = solution.prices
      await stablecoinConverter.submitSolution(
        batchIndex, solution.owners.map(x => accounts[x]), orderIds, volume, prices, solution.tokenIdsForPrice, { from: solver }
      )

      const actualObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call())
      assert.equal(actualObjectiveValue.toString(), solution.objectiveValue.toString())

      // NOTE that orders.length = deposits.length
      assert(basicRingTradeCase.orders.length == basicRingTradeCase.deposits.length)
      for (let i = 0; i < basicRingTradeCase.orders.length; i++) {
        const deposit = basicRingTradeCase.deposits[i]
        const order = basicRingTradeCase.orders[i]

        const buyToken = await stablecoinConverter.tokenIdToAddressMap.call(order.buyToken)
        const sellToken = await stablecoinConverter.tokenIdToAddressMap.call(order.sellToken)
        const relevantUser = accounts[order.user]

        const sellTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, sellToken)
        const buyTokenBalance = await stablecoinConverter.getBalance.call(relevantUser, buyToken)

        assert.equal(
          sellTokenBalance.toString(),
          deposit.amount.sub(getExecutedSellAmount(solution.buyVolumes[i], prices[order.buyToken], prices[order.sellToken])).toString(),
          `Sold tokens were not adjusted correctly ${i}`
        )
        assert.equal(
          buyTokenBalance.toString(),
          solution.buyVolumes[i].toString(),
          `Bought tokens were not adjusted correctly ${i}`
        )
      }
    })
    it("checks that currentPrices between different solutions are reset", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const tradeCase = shortRingBetterTradeCase

      // Make deposits
      for (const deposit of tradeCase.deposits) {
        const tokenAddress = await stablecoinConverter.tokenIdToAddressMap.call(deposit.token)
        await stablecoinConverter.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
      }

      // Place orders
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderIds = []
      for (const order of tradeCase.orders) {
        orderIds.push(
          await sendTxAndGetReturnValue(
            stablecoinConverter.placeOrder,
            order.buyToken,
            order.sellToken,
            batchIndex + 1,
            order.buyAmount,
            order.sellAmount,
            { from: accounts[order.user] }
          )
        )
      }
      await closeAuction(stablecoinConverter)
      const ringSolution = tradeCase.solutions[0]
      await stablecoinConverter.submitSolution(
        batchIndex,
        ringSolution.owners.map(x => accounts[x]),
        orderIds,
        ringSolution.buyVolumes,
        ringSolution.prices,
        ringSolution.tokenIdsForPrice,
        { from: solver }
      )


      assert.equal(ringSolution.prices[2].toString(), (await stablecoinConverter.currentPrices.call(2)).toString(), "CurrentPrice were not adjusted correctly")

      const directSolution = tradeCase.solutions[1]
      await stablecoinConverter.submitSolution(
        batchIndex,
        directSolution.owners.map(x => accounts[x]),
        orderIds,
        directSolution.buyVolumes,
        directSolution.prices,
        directSolution.tokenIdsForPrice,
        { from: solver }
      )
      assert.equal(0, (await stablecoinConverter.currentPrices.call(2)).toString(), "CurrentPrice were not adjusted correctly")
    })
    // TODO!
    // it.only("checks that solution trades are deleted even if balances get temporarily negative while reverting ", async () => {
    //   // The following test, a user_2 will receive some tokens and sell these received tokens in one batch.
    //   // If this batch-trade gets executed and later reverted by another trade, users_2's balance would be temporarily negative, unless
    //   // in the settlement and reversion not all buyAmounts will be credited first, before the sellAmounts are subtracted.
    //   // This test checks that we have met this "unless condition" and that our test is not failing due to temporarily negative balances
    //   const feeToken = await MockContract.new()
    //   const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    //   const erc20_2 = await MockContract.new()

    //   await feeToken.givenAnyReturnBool(true)
    //   await erc20_2.givenAnyReturnBool(true)

    //   await stablecoinConverter.deposit(feeToken.address, feeAdded(10000), { from: user_1 })
    //   await stablecoinConverter.deposit(erc20_2.address, feeAdded(10000), { from: user_3 })
    //   await stablecoinConverter.deposit(erc20_2.address, 19, { from: user_2 }) // needed to pay fees

    //   await stablecoinConverter.addToken(erc20_2.address)

    //   const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

    //   const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 5000, feeAdded(10000), { from: user_1 })
    //   const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
    //   const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
    //   const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, batchIndex + 1, 5000, feeAdded(10000), { from: user_3 })

    //   await closeAuction(stablecoinConverter)

    //   const prices = [1000000, 1000000]
    //   const owner = [user_1, user_2, user_2, user_3]
    //   const orderId = [orderId1, orderId2, orderId3, orderId4]
    //   const volume = [10000, 9990, 9981, 9972] // volumes are the previous volume minus fees
    //   const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

    //   await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solver })

    //   assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_3, feeToken.address)).toNumber(), volume[3], "Bought tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 0, "Bought and sold tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_3, erc20_2.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[3], prices[1], prices[0]), "Sold tokens were not adjusted correctly")

    //   // Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
    //   await truffleAssert.reverts(
    //     stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solver }),
    //     "Solution must have a higher objective value than current solution"
    //   )
    // })
    // it.only("checks that trades documented from a previous trade are deleted and not considered for a new batchIndex", async () => {
    //   const feeToken = await MockContract.new()
    //   const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
    //   const erc20_2 = await MockContract.new()

    //   await feeToken.givenAnyReturnBool(true)
    //   await erc20_2.givenAnyReturnBool(true)

    //   await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
    //   await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

    //   await stablecoinConverter.addToken(erc20_2.address)
    //   const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

    //   const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
    //   const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

    //   await closeAuction(stablecoinConverter)

    //   const prices = basicTrade.solution.prices
    //   const owner = basicTrade.solution.owners
    //   const orderId = [orderId1, orderId2]
    //   const volume = [7000, 14000]
    //   const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

    //   await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solver })

    //   assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
    //   assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

    //   await waitForNSeconds(BATCH_TIME)

    //   const volume2 = [2000, 4000]
    //   await stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume2, prices, tokenIdsForPrice, { from: solver })

    //   assert.equal(
    //     basicTrade.deposits[0].amount - getSellVolume(volume[0] + volume2[0], prices[0], prices[1]),
    //     (await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(),
    //     "Sold tokens were not adjusted correctly"
    //   )
    //   assert.equal(
    //     volume[0] + volume2[0],
    //     (await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(),
    //     "Bought tokens were not adjusted correctly"
    //   )
    //   assert.equal(
    //     basicTrade.deposits[1].amount - getSellVolume(volume[1] + volume2[1], prices[1], prices[0]),
    //     (await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(),
    //     "Sold tokens were not adjusted correctly"
    //   )
    //   assert.equal(
    //     volume[1] + volume2[1],
    //     (await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(),
    //     "Bought tokens were not adjusted correctly"
    //   )
    // })
  })
  describe("getEncodedAuctionElements()", async () => {
    it("returns all orders that are have ever been submitted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)

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
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      await stablecoinConverter.deposit(erc20_1.address, 8, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(1, 2, batchIndex, 20, 10, { from: user_1 })

      let auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 0)

      await waitForNSeconds(BATCH_TIME)

      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements[0].sellTokenBalance, 20)
    })
    it("includes freed orders with empty fields", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      await stablecoinConverter.placeOrder(1, 0, batchIndex + 10, 20, 10)
      stablecoinConverter.cancelOrder(0)

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
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const auctionElements = await stablecoinConverter.getEncodedAuctionElements()

      assert.equal(auctionElements, null)
    })
  })
})

// function evaluateTradeUtility(buyAmount, sellAmount, executedBuyAmount, executedSellAmount, priceBuyToken, priceSellToken) {
//   const scaledSellAmount = getExecutedSellAmount(executedBuyAmount, priceBuyToken, priceSellToken, 2)
//   const essentialUtility = (executedBuyAmount - Math.floor((scaledSellAmount * buyAmount) / sellAmount)) * priceBuyToken
//   const utilityError = Math.floor([(scaledSellAmount * buyAmount) % sellAmount] * priceBuyToken / sellAmount)
//   return essentialUtility - utilityError
// }

// function disregardedUtility(buyAmount, sellAmount, executedBuyAmount, executedSellAmount, priceBuyToken, priceSellToken) {
//   const limitTerm = priceSellToken * sellAmount - priceBuyToken * feeAdded(buyAmount)
//   // Note, this computation assumes bidder has sufficient balance remaining
//   // Usually leftoverSellAmount = MIN(sellAmount - executedSellAmount, user.balance.sellToken)

//   const leftoverSellAmount = sellAmount - executedSellAmount
//   return Math.floor((leftoverSellAmount * limitTerm) / sellAmount)
// }

const closeAuction = async (instance) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1)
}
