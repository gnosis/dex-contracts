const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue
} = require("./utilities.js")

const feeDenominator = 1000 // fee is (1 / feeDenominator)

function feeSubtracted(x) {
  return Math.floor(x * (feeDenominator - 1) / feeDenominator)
}

function feeAdded(x) {
  return Math.floor(x * (feeDenominator) / (feeDenominator - 1))
}

function getSellVolume(x, priceNumerator, priceDenominator) {
  return Math.floor(Math.floor(x * priceDenominator / (feeDenominator - 1)) * feeDenominator / priceNumerator)
}

contract("StablecoinConverter", async (accounts) => {

  const [user_1, user_2, user_3, solutionSubmitter] = accounts
  let BATCH_TIME
  beforeEach(async () => {
    const feeToken = await MockContract.new()
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)
    await StablecoinConverter.link(IterableAppendOnlySet, lib2.address)
    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })

  // Basic Trade used in most of the tests:
  // Trade for user_1: amount of token_1 sold: 20020, amount of token_2 bought: 10000,
  // Trade for user_2: amount of token_2 sold: 10000, amount of token_1 bought: feeSubtracted(10000) * 2
  // ==> Token conservation holds for token_2, and fee token == token_1 has negative balance of 40

  const basicTrade = {
    deposits: [{ amount: feeAdded(20000), token: 0, user: user_1 }, { amount: feeAdded(10000) * 2, token: 1, user: user_2 }],
    orders: [
      { sellToken: 0, buyToken: 1, sellAmount: feeAdded(20000), buyAmount: 10000, user: user_1 },
      { sellToken: 1, buyToken: 0, sellAmount: feeAdded(10000), buyAmount: feeSubtracted(10000) * 2, user: user_2 }
    ],
    solution: { prices: [1, 2], owners: [user_1, user_2], volume: [10000, feeSubtracted(10000) * 2], tokenIdsForPrice: [0, 1] }
  }

  describe("placeOrder", () => {
    it("places Orders and checks parameters", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()
      const id = await stablecoinConverter.placeOrder.call(0, 1, true, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, true, 3, 10, 20, { from: user_1 })
      const orderResult = (await stablecoinConverter.orders.call(user_1, id))
      assert.equal((orderResult.priceDenominator).toNumber(), 20, "priceDenominator was stored incorrectly")
      assert.equal((orderResult.priceNumerator).toNumber(), 10, "priceNumerator was stored incorrectly")
      assert.equal((orderResult.sellToken).toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal((orderResult.buyToken).toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal(orderResult.isSellOrder, true, "sellTokenFlag was stored incorrectly")
      assert.equal((orderResult.validFrom).toNumber(), currentStateIndex.toNumber(), "validFrom was stored incorrectly")
      assert.equal((orderResult.validUntil).toNumber(), 3, "validUntil was stored incorrectly")
    })
  })
  describe("cancelOrder", () => {
    it("places orders, then cancels it and orders status", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const id = await stablecoinConverter.placeOrder.call(0, 1, true, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, true, 3, 10, 20, { from: user_1 })
      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()
      await stablecoinConverter.cancelOrder(id, { from: user_1 })
      assert.equal(
        ((await stablecoinConverter.orders.call(user_1, id)).validUntil).toNumber(),
        (currentStateIndex.toNumber() - 1),
        "validUntil was stored incorrectly"
      )

    })
  })
  describe("freeStorageOfOrder", () => {
    it("places a order, then cancels and deletes it", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder(id)

      assert.equal((await stablecoinConverter.orders(user_1, id)).priceDenominator, 0, "priceDenominator was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const currentStateIndex = await stablecoinConverter.getCurrentBatchId()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
  })
  describe("addToken", () => {
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

    it("Reject: add same token twice", async () => {
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
  })
  describe("submitSolution", () => {
    it("places two orders and matches them in a solution with traders' Utility == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")
    })
    it("places two orders and matches them in a solution with traders' Utility >0", async () => {

      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, feeSubtracted(10000), feeAdded(10000), { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = [10, 10]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(10000)]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")
    })

    it("places two orders, matches them partially and then checks correct order adjustments", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(10000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice
      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

      const orderResult1 = (await stablecoinConverter.orders.call(user_1, orderId1))
      const orderResult2 = (await stablecoinConverter.orders.call(user_2, orderId2))

      assert.equal((orderResult1.remainingAmount).toNumber(), basicTrade.orders[0].sellAmount - getSellVolume(volume[0], prices[0], prices[1]), "remainingAmount was stored incorrectly")
      assert.equal((orderResult1.priceDenominator).toNumber(), basicTrade.orders[0].sellAmount, "priceDenominator was stored incorrectly")
      assert.equal((orderResult1.priceNumerator).toNumber(), basicTrade.orders[0].buyAmount, "priceNominator was stored incorrectly")
      assert.equal((orderResult2.remainingAmount).toNumber(), basicTrade.orders[1].sellAmount - getSellVolume(volume[1], prices[1], prices[0]), "remainingAmount was stored incorrectly")
      assert.equal((orderResult2.priceDenominator).toNumber(), basicTrade.orders[1].sellAmount, "priceDenominator was stored incorrectly")
      assert.equal((orderResult2.priceNumerator).toNumber(), basicTrade.orders[1].buyAmount, "priceNominator was stored incorrectly")
    })
    it("places two orders, first matches them partially and then fully in a 2nd solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [4000, feeSubtracted(4000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

      const volume2 = basicTrade.solution.volume

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume2[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume2[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume2[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume2[1], "Bought tokens were not adjusted correctly")
    })
    it("checks that the 2nd solution is also correctly documented and can be reverted by a 3rd solution", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [5000, feeSubtracted(5000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice


      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const volume2 = [6000, feeSubtracted(6000) * 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const volume3 = basicTrade.solution.volume

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume3, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume3[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume3[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume3[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume3[1], "Bought tokens were not adjusted correctly")
    })
    it("checks that solution trades are deleted even if balances get temporarily negative while reverting ", async () => {
      // The following test, a user_2 will receive some tokens and sell these received tokens in one batch.
      // If this batch-trade gets executed and later reverted by another trade, users_2's balance would be temporarily negative, unless
      // in the settlement and reversion not all buyAmounts will be credited first, before the sellAmounts are subtracted.
      // This test checks that we have met this "unless condition" and that our test is not failing due to temporarily negative balances
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, feeAdded(10000), { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, feeAdded(10000), { from: user_3 })
      await stablecoinConverter.deposit(erc20_2.address, 19, { from: user_2 }) // needed to pay fees

      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 5000, feeAdded(10000), { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
      const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 5000, feeAdded(10000), { from: user_3 })

      await closeAuction(stablecoinConverter)

      const prices = [1000000, 1000000]
      const owner = [user_1, user_2, user_2, user_3]
      const orderId = [orderId1, orderId2, orderId3, orderId4]
      const volume = [10000, 9990, 9981, 9972] // volumes are the previous volume minus fees
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })


      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, feeToken.address)).toNumber(), volume[3], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 0, "Bought and sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, erc20_2.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[3], prices[1], prices[0]), "Sold tokens were not adjusted correctly")

      //Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "Solution does not have a higher objective value than a previous solution"
      )
    })
    it("checks that trades documented from a previous trade are deleted and not considered for a new batchIndex", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [5000, feeSubtracted(5000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

      await waitForNSeconds(BATCH_TIME)

      await stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - 2 * getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), 2 * volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - 2 * getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), 2 * volume[1], "Bought tokens were not adjusted correctly")
    })
    it("settles a ring trade between 3 tokens", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)


      await stablecoinConverter.deposit(feeToken.address, feeAdded(10000), { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, feeAdded(10000), { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, feeAdded(10000), { from: user_3 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 1000, feeAdded(10000), { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex + 1, 1000, feeAdded(10000), { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, true, batchIndex + 1, 1000, feeAdded(10000), { from: user_3 })


      await closeAuction(stablecoinConverter)

      const prices = [1000000, 1000000, 1000000]
      const owner = [user_1, user_2, user_3]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2, orderId3]
      const volume = [10000, 9990, 9981]
      const tokenIdsForPrice = [0, 1, 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[1], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, erc20_3.address)).toNumber(), feeAdded(10000) - getSellVolume(volume[2], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_3.address), volume[1], "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_3, feeToken.address), volume[2], "Bought tokens were not adjusted correctly")
    })
    it("throws, if the batchIndex is incorrect", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("throws, if order is not yet valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "Order is not yet valid"
      )
    })
    it("throws, if order is no longer valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)
      // close another auction
      await waitForNSeconds(BATCH_TIME)
      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Order is no longer valid"
      )
    })
    it("throws, if limit price is not met for an order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex, basicTrade.orders[0].buyAmount + 100, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)
      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "limit price not satisfied"
      )
    })
    it("throws, if sell volume is bigger than amount specified in the order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)
      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [basicTrade.orders[0].sellAmount + 1, basicTrade.orders[1].sellAmount + 1]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "executedSellAmount bigger than specified in order"
      )
    })
    it("throws, if token conservation does not hold", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount - 1, basicTrade.orders[1].sellAmount, { from: user_2 })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [basicTrade.solution.volume[0], basicTrade.solution.volume[1] - 1]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice


      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "Token conservation does not hold"
      )
    })
    it("throws, if sell volume is bigger than balance available", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.solution.volume[0] - 1, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)
      )
    })
    it("reverts, if findPriceIndex does not find the token, as it is not supplied", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)
      await stablecoinConverter.deposit(feeToken.address, 10000, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 10000, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 10000, { from: user_1 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex, 5000, 10000, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 2, true, batchIndex, 5000, 10000, { from: user_2 })

      await closeAuction(stablecoinConverter)
      const prices = [10000, 10000, 10000]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [5000, feeSubtracted(5000)]
      const tokenIdsForPrice = [0, 1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "Price not provided for token"
      )
    })
    it("reverts, if tokenIds for prices are not sorted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = [0, 1, 1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "prices are not ordered by tokenId"
      )
    })
    it("reverts, if tokenIds for prices reference the fee token", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = [1, 1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "fee token price has to be specified"
      )
    })
    it("reverts, if price of sellToken == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = [0, 0]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "prices are not allowed to be zero"
      )
    })
    it("checks that findPriceIndex also works, if it decreases the search bounds - all other tests only increase", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = [10, 20, 3, 4]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = [0, 1, 2, 3]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)
    })
    it("checks that currentPrices between different solutions are reset", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)


      await stablecoinConverter.deposit(feeToken.address, 60000, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 60000, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 10000, { from: user_3 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 10000, 60000, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex + 1, 10000, 60000, { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, true, batchIndex + 1, 10000, 60000, { from: user_3 })
      const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 10000, 60000, { from: user_2 })


      await closeAuction(stablecoinConverter)

      const prices = [10000000, 10000000, 10000000]
      const owner = [user_1, user_2, user_3]
      const orderId = [orderId1, orderId2, orderId3]
      const volume = [10000, 9990, 9981]
      const tokenIdsForPrice = [0, 1, 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)
      assert.equal((await stablecoinConverter.currentPrices.call(2)).toNumber(), 10000000, "CurrentPrice were not adjusted correctly")

      const prices2 = [10, 10]
      const owner2 = [user_1, user_2]
      const orderIds2 = [orderId1, orderId4]
      const volume2 = [50000, feeSubtracted(50000)]
      const tokenIdsForPrice2 = [0, 1]

      await stablecoinConverter.submitSolution(batchIndex, owner2, orderIds2, volume2, prices2, tokenIdsForPrice2)
      assert.equal((await stablecoinConverter.currentPrices.call(2)).toNumber(), 0, "CurrentPrice were not adjusted correctly")
    })
    it("reverts, if price of buyToken == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = [0, 0]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "prices are not allowed to be zero"
      )
    })
    it("grants fee surplus to solution submitter", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getBalance.call(solutionSubmitter, feeToken.address)).toNumber(), (getSellVolume(volume[0], prices[0], prices[1]) - volume[1]) / 2, "fee was not granted correctly")
    })
    it("checks that fees are deducted from previous solution submitter, if a better solution is submitted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [5000, feeSubtracted(5000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getBalance.call(solutionSubmitter, feeToken.address)).toNumber(), (getSellVolume(volume[0], prices[0], prices[1]) - volume[1]) / 2, "fee was not granted correctly")

      const volume2 = [6000, feeSubtracted(6000) * 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice)
      assert.equal((await stablecoinConverter.getBalance.call(solutionSubmitter, feeToken.address)).toNumber(), 0, "fee was not reverted")
    })
    it("checks that credited tokens can not be withdrawn in same batch as the solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })
      await stablecoinConverter.requestWithdraw(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.requestWithdraw(feeToken.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[0].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      await truffleAssert.reverts(
        stablecoinConverter.withdraw(erc20_2.address, { from: basicTrade.deposits[0].user }),
        "withdraw was not registered previously"
      )
    })
    it("checks that credited feeToken reward can not be withdrawn in same batch as the solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })
      await stablecoinConverter.requestWithdraw(feeToken.address, 1, { from: solutionSubmitter })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      await truffleAssert.reverts(
        stablecoinConverter.withdraw(feeToken.address, { from: solutionSubmitter }),
        "withdraw was not registered previously"
      )
    })
    it("checks that the objective value is stored correctly and updated after a new solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [4000, feeSubtracted(4000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber(), (getSellVolume(volume[0], prices[0], prices[1]) - volume[1]), "Objective value is not stored correct")

      const volume2 = basicTrade.solution.volume

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber(), (getSellVolume(volume2[0], prices[0], prices[1]) - volume2[1]), "Objective value is not stored correct after a second solution submission")
    })
    it("checks that the objective value is returned correctly after getting into a new batch", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [4000, feeSubtracted(4000) * 2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      await closeAuction(stablecoinConverter)

      assert.equal((await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber(), 0, "Objective value is not returned correct")
    })
    it("reverts, if downcast from u256 to u128 would change the value", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = ["340282366920938463463374607431768211455", 1] // [2**128 -1,1]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "sellAmount too large"
      )
    })

  })
  describe("getEncodedAuctionElements", async () => {
    it("returns all orders that are have ever been submitted", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      await stablecoinConverter.placeOrder(1, 0, true, batchIndex, 20, 10, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, true, batchIndex + 10, 500, 400, { from: user_2 })

      const auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 2)
      assert.deepEqual(auctionElements[0], {
        user: user_1.toLowerCase(),
        sellTokenBalance: 0,
        buyToken: 1,
        sellToken: 0,
        validFrom: batchIndex,
        validUntil: batchIndex,
        isSellOrder: true,
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
        isSellOrder: true,
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
      await stablecoinConverter.placeOrder(1, 2, true, batchIndex, 20, 10, { from: user_1 })

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
      await stablecoinConverter.placeOrder(1, 0, true, batchIndex + 10, 20, 10)
      stablecoinConverter.cancelOrder(0)

      let auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await waitForNSeconds(BATCH_TIME)

      // Cancellation is active but not yet freed
      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, batchIndex)

      await stablecoinConverter.freeStorageOfOrder(0)

      auctionElements = decodeAuctionElements(await stablecoinConverter.getEncodedAuctionElements())
      assert.equal(auctionElements.length, 1)
      assert.equal(auctionElements[0].validFrom, 0)
    })
    it("reverts if there are no orders", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      await truffleAssert.reverts(stablecoinConverter.getEncodedAuctionElements())
    })
  })
})


const ADDRESS_WIDTH = 20 * 2
const UINT256_WIDTH = 32 * 2
const UINT16_WIDTH = 2 * 2
const UINT32_WIDTH = 4 * 2
const UINT128_WIDTH = 16 * 2

function decodeAuctionElements(bytes) {
  const result = []
  bytes = bytes.slice(2) // cutting of 0x
  while (bytes.length > 0) {
    const element = bytes.slice(0, 113 * 2).split("")
    bytes = bytes.slice(113 * 2)
    result.push({
      user: "0x" + element.splice(0, ADDRESS_WIDTH).join(""), // address is only 20 bytes
      sellTokenBalance: parseInt(element.splice(0, UINT256_WIDTH).join(""), 16),
      buyToken: parseInt(element.splice(0, UINT16_WIDTH).join(""), 16),
      sellToken: parseInt(element.splice(0, UINT16_WIDTH).join(""), 16),
      validFrom: parseInt(element.splice(0, UINT32_WIDTH).join(""), 16),
      validUntil: parseInt(element.splice(0, UINT32_WIDTH).join(""), 16),
      isSellOrder: parseInt(element.splice(0, 2).join(""), 16) > 0,
      priceNumerator: parseInt(element.splice(0, UINT128_WIDTH).join(""), 16),
      priceDenominator: parseInt(element.splice(0, UINT128_WIDTH).join(""), 16),
      remainingAmount: parseInt(element.splice(0, UINT128_WIDTH).join(""), 16),
    })
  }
  return result
}

const closeAuction = async (instance) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1)
}