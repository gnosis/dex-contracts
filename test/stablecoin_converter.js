const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue,
  decodeAuctionElements
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
  before(async () => {
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
    solution: { prices: [1, 2], owners: [user_1, user_2], volume: [10000, 20000], tokenIdsForPrice: [0, 1] }
  }

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
  describe("submitSolution()", () => {
    it("rejects trivial solution (the only solution with zero utility)", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, [0, 0], prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "Solution must be better than trivial"
      )
      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert.equal(0, currentObjectiveValue)
    })
    it("places two orders and matches them in a solution with Utility > 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()
      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, feeSubtracted(10000), feeAdded(10000), { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = [1, 1]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [10000, 10000]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

      const currentObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert(currentObjectiveValue > 0)
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [10000, 20000]
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [7000, 14000]

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [7000, 14000]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const volume2 = [8000, 16000]
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 5000, feeAdded(10000), { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 5000, feeAdded(10000), { from: user_2 })
      const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, batchIndex + 1, 5000, feeAdded(10000), { from: user_3 })

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

      // Now reverting should not throw due to temporarily negative balances, only later due to objective value criteria
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [7000, 14000]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), basicTrade.deposits[0].amount - getSellVolume(volume[0], prices[0], prices[1]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), volume[0], "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), basicTrade.deposits[1].amount - getSellVolume(volume[1], prices[1], prices[0]), "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), volume[1], "Bought tokens were not adjusted correctly")

      await waitForNSeconds(BATCH_TIME)

      const volume2 = [2000, 4000]
      await stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      assert.equal(
        basicTrade.deposits[0].amount - getSellVolume(volume[0] + volume2[0], prices[0], prices[1]),
        (await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        volume[0] + volume2[0],
        (await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(),
        "Bought tokens were not adjusted correctly"
      )
      assert.equal(
        basicTrade.deposits[1].amount - getSellVolume(volume[1] + volume2[1], prices[1], prices[0]),
        (await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(),
        "Sold tokens were not adjusted correctly"
      )
      assert.equal(
        volume[1] + volume2[1],
        (await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(),
        "Bought tokens were not adjusted correctly"
      )
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 1000, feeAdded(10000), { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, batchIndex + 1, 1000, feeAdded(10000), { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, batchIndex + 1, 1000, feeAdded(10000), { from: user_3 })


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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "Order is invalid"
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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
        "Order is invalid"
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex, basicTrade.orders[0].buyAmount + 100, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount - 1, basicTrade.orders[1].sellAmount, { from: user_2 })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [basicTrade.solution.volume[0], basicTrade.solution.volume[1] - 21]
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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


      await stablecoinConverter.deposit(feeToken.address, feeAdded(110000), { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, feeAdded(100000), { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, feeAdded(10000), { from: user_3 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 10000, feeAdded(10000), { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, batchIndex + 1, 10000, feeAdded(10000), { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, batchIndex + 1, 10000, feeAdded(10000), { from: user_3 })
      const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, batchIndex + 1, 100000, feeAdded(100000), { from: user_2 })
      const orderId5 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, batchIndex + 1, 100000, feeAdded(100000), { from: user_1 })

      await closeAuction(stablecoinConverter)

      const prices = [1, 1, 1]
      const owner = [user_1, user_2, user_3]
      const orderId = [orderId1, orderId2, orderId3]
      const volume = [10000, 10000, 10000]
      const tokenIdsForPrice = [0, 1, 2]
      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal(1, (await stablecoinConverter.currentPrices.call(2)).toNumber(), "CurrentPrice were not adjusted correctly")
      const prices2 = [1, 1]
      const owner2 = [user_1, user_2]
      const orderIds2 = [orderId5, orderId4]
      const volume2 = [100000, 100000]
      const tokenIdsForPrice2 = [0, 1]

      await stablecoinConverter.submitSolution(batchIndex, owner2, orderIds2, volume2, prices2, tokenIdsForPrice2)
      assert.equal(0, (await stablecoinConverter.currentPrices.call(2)).toNumber(), "CurrentPrice were not adjusted correctly")
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [7000, 14000]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.getBalance.call(solutionSubmitter, feeToken.address)).toNumber(), (getSellVolume(volume[0], prices[0], prices[1]) - volume[1]) / 2, "fee was not granted correctly")

      const volume2 = [8000, 16000]

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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.lastCreditBatchId.call(basicTrade.orders[0].user, erc20_2.address)).toString(), (batchIndex + 1).toString())

      await truffleAssert.reverts(
        stablecoinConverter.withdraw(basicTrade.deposits[0].user, erc20_2.address, { from: basicTrade.deposits[0].user }),
        "Withdraw not possible for token that is traded in the current auction"
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      assert.equal((await stablecoinConverter.lastCreditBatchId.call(solutionSubmitter, feeToken.address)).toString(), (batchIndex + 1).toString())

      await truffleAssert.reverts(
        stablecoinConverter.withdraw(solutionSubmitter, feeToken.address, { from: solutionSubmitter }),
        "Withdraw not possible for token that is traded in the current auction"
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)
      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const buyVolume = [7000, 14000]
      const sellVolume = [
        getExecutedSellAmount(buyVolume[0], prices[1], prices[0], 1),
        getExecutedSellAmount(buyVolume[1], prices[0], prices[1], 1),
      ]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice
      const tradeUtilities = [
        evaluateTradeUtility(basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, buyVolume[0], sellVolume[0], prices[1], prices[0]),
        evaluateTradeUtility(basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, buyVolume[1], sellVolume[1], prices[0], prices[1])
      ]
      const totalUtility = tradeUtilities.reduce((a, b) => a + b, 0)
      const disregardedUtilites = [
        disregardedUtility(basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, buyVolume[0], sellVolume[0], prices[1], prices[0]),
        disregardedUtility(basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, buyVolume[1], sellVolume[1], prices[0], prices[1])
      ]
      const totalDisregardedUtility = disregardedUtilites.reduce((a, b) => a + b, 0)
      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, buyVolume, prices, tokenIdsForPrice, { from: solutionSubmitter })
      const actualObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()

      assert.equal(actualObjectiveValue, totalUtility - totalDisregardedUtility, "Objective value is not stored correct")

      const buyVolume2 = basicTrade.solution.volume
      const sellVolume2 = [
        getExecutedSellAmount(buyVolume2[0], prices[1], prices[0], 1),
        getExecutedSellAmount(buyVolume2[1], prices[0], prices[1], 1),
      ]
      const tradeUtilities2 = [
        evaluateTradeUtility(basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, buyVolume2[0], sellVolume2[0], prices[1], prices[0]),
        evaluateTradeUtility(basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, buyVolume2[1], sellVolume2[1], prices[0], prices[1])
      ]
      const totalUtility2 = tradeUtilities2.reduce((a, b) => a + b, 0)
      const disregardedUtilites2 = [
        disregardedUtility(basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, buyVolume2[0], sellVolume2[0], prices[1], prices[0]),
        disregardedUtility(basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, buyVolume2[1], sellVolume2[1], prices[0], prices[1])
      ]
      const totalDisregardedUtility2 = disregardedUtilites2.reduce((a, b) => a + b, 0)

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, buyVolume2, prices, tokenIdsForPrice, { from: solutionSubmitter })
      const actualObjectiveValue2 = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert.equal(
        actualObjectiveValue2,
        totalUtility2 - totalDisregardedUtility2,
        "Objective value incorrect after second solution submission"
      )
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = [7000, 14000]
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      await closeAuction(stablecoinConverter)
      const actualObjectiveValue = (await stablecoinConverter.getCurrentObjectiveValue.call()).toNumber()
      assert.equal(actualObjectiveValue, 0, "Objective value is not returned correct")
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

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = ["340282366920938463463374607431768211455", 1] // [2**128 -1,1]
      const owner = basicTrade.solution.owners
      const orderId = [orderId1, orderId2]
      const volume = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "SafeCast: value doesn't fit in 128 bits"
      )
    })
    it("reverts if max touched orders is exceeded", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
      await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

      await closeAuction(stablecoinConverter)

      const prices = basicTrade.solution.prices
      const seedOwners = basicTrade.solution.owners
      const seedVolumes = basicTrade.solution.volume
      const tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice

      const halfNumTouched = 20
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderId = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))
      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "Solution exceeds MAX_TOUCHED_ORDERS"
      )
    })
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

function getExecutedSellAmount(executedBuyAmount, buyTokenPrice, sellTokenPrice, scale) {
  const scaledFee = scale * feeDenominator
  return Math.floor(Math.floor((executedBuyAmount * buyTokenPrice) / (scaledFee - 1)) * scaledFee / sellTokenPrice)
}

function evaluateTradeUtility(buyAmount, sellAmount, executedBuyAmount, executedSellAmount, priceBuyToken, priceSellToken) {
  const scaledSellAmount = getExecutedSellAmount(executedBuyAmount, priceBuyToken, priceSellToken, 2)
  const essentialUtility = (executedBuyAmount - Math.floor((scaledSellAmount * buyAmount) / sellAmount)) * priceBuyToken
  const utilityError = Math.floor([(scaledSellAmount * buyAmount) % sellAmount] * priceBuyToken / sellAmount)
  return essentialUtility - utilityError
}

function disregardedUtility(buyAmount, sellAmount, executedBuyAmount, executedSellAmount, priceBuyToken, priceSellToken) {
  const limitTerm = priceSellToken * sellAmount - priceBuyToken * buyAmount
  // Note, this computation assumes bidder has sufficient balance remaining
  // Usually leftoverSellAmount = MIN(sellAmount - executedSellAmount, user.balance.sellToken)

  const leftoverSellAmount = sellAmount - executedSellAmount
  return Math.floor((leftoverSellAmount * limitTerm) / sellAmount)
}

const closeAuction = async (instance) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1)
}
