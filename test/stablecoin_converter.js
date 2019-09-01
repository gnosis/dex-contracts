const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const ERC20 = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue } = require("./utilities.js")

const feeDenominator = 1000 // this will imply a fee of: (feeDenominator - 1) / feeDenominator
function feeSubtracted(x) {
  return Math.floor(x * (feeDenominator - 1) / feeDenominator)
}

// Basic Trade used in most of the tests:
// amount of token1 sold 20000 by user1, amount of token2 bought feeSubtracted(10000) by user1,
// amount of token2 sold feeSubtracted(10000) by user2, amount of token1 bought feeSubtracted(feeSubtracted(10000) * 2) by user2
const bT = {
  firstToken: 0,
  secondToken: 1,
  prices: [20, 10], // price 2 to 1
  orderOneSellAmount: 20000,
  orderOneBuyAmount: feeSubtracted(10000),
  orderTwoSellAmount: feeSubtracted(10000),
  orderTwoBuyAmount: feeSubtracted(feeSubtracted(10000) * 2),
  volume: [20000, feeSubtracted(10000)],
  deposit1: 20000,
  deposit2: 10000
}

contract("StablecoinConverter", async (accounts) => {

  const [user_1, user_2, user_3] = accounts
  let BATCH_TIME
  beforeEach(async () => {
    const lib1 = await IdToAddressBiMap.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)
    const feeToken = await MockContract.new()
    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })

  describe("placeOrder", () => {
    it("places Orders and checks parameters", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()
      const id = await stablecoinConverter.placeOrder.call(0, 1, true, 3, 10, 20, { from: user_1 })
      await stablecoinConverter.placeOrder(0, 1, true, 3, 10, 20, { from: user_1 })
      const orderResult = (await stablecoinConverter.orders.call(user_1, id))
      assert.equal((orderResult.sellAmount).toNumber(), 20, "sellAmount was stored incorrectly")
      assert.equal((orderResult.buyAmount).toNumber(), 10, "buyAmount was stored incorrectly")
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
      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()
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

      assert.equal((await stablecoinConverter.orders(user_1, id)).sellAmount, 0, "sellAmount was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()

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
    it("places two orders and matches them in a solution with traders' Utility == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]


      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")
    })
    it("places two orders and matches them in a solution with traders' Utility >0", async () => {

      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.addToken(erc20_2.address)

      await stablecoinConverter.deposit(feeToken.address, 10000, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20000, { from: user_2 })

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, feeSubtracted(10000), 20000, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, feeSubtracted(feeSubtracted(10000)), feeSubtracted(10000), { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 10]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10000, 9990]
      const tokenIdsForPrice = [1]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(10000), "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, feeToken.address), feeSubtracted(9990), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 20000 - 9990, "Sold tokens were not adjusted correctly")
    })

    it("places two orders, matches them partially and then checks correct order adjustments", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(5000)]
      const tokenIdsForPrice = [1]
      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")
      const orderResult1 = (await stablecoinConverter.orders.call(user_1, orderId1))
      const orderResult2 = (await stablecoinConverter.orders.call(user_2, orderId2))

      assert.equal((orderResult1.volume).toNumber(), bT.orderOneSellAmount - volume[0], "sellAmount was stored incorrectly")

      assert.equal((orderResult2.volume).toNumber(), bT.orderTwoSellAmount - volume[1], "sellAmount was stored incorrectly")
    })
    it("places two orders and first matches them partially and then fully in a 2nd solution submission", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(5000)]
      const tokenIdsForPrice = [1]


      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")

      const volume2 = bT.volume

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume2[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume2[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume2[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume2[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")
    })
    it("checks that the 2nd solution is also correctly documented and can be reverted by a 3rd solution", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(5000)]
      const tokenIdsForPrice = [1]


      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")

      const volume2 = [12000, feeSubtracted(6000)]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume2, prices, tokenIdsForPrice)
      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume2[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume2[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume2[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume2[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")

      const volume3 = bT.volume

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume3, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume3[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume3[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume3[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume3[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")
    })
    it("checks that solution trades are deleted even if balances get temporarily negative while reverting ", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, 10000, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 10000, { from: user_3 })
      await stablecoinConverter.deposit(erc20_2.address, 2000, { from: user_2 }) // needed to pay feeds

      await stablecoinConverter.addToken(erc20_2.address)

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, feeSubtracted(10000) - 1, 10000, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, feeSubtracted(10000) - 1, 10000, { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, feeSubtracted(10000) - 1, 10000, { from: user_2 })
      const orderId4 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, feeSubtracted(10000) - 1, 10000, { from: user_3 })

      // close auction
      await waitForNSeconds(BATCH_TIME + 1)

      // amount of token1 sold 10000, amount of token2 bought 9990
      // amount of token2 sold 9990, amount of token1 bought 9980 by user2
      // amount of token1 sold 9980 by user2, amount of token2 bought 9970 
      // amount of token2 sold 9970, amount of token1 bought 9960

      // user2 would have negative balance while reverting the trades

      const prices = [10, 10]
      const owner = [user_1, user_2, user_2, user_3]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2, orderId3, orderId4]
      const volume = [10000, 9990, 9980, 9970]
      const tokenIdsForPrice = [1]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, feeToken.address)).toNumber(), 9960, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 9990, "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 2000 - 20, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_3, erc20_2.address), 10000 - 9970, "Sold tokens were not adjusted correctly")
      //Now reverting should not throw, only later due to fee criteria
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "Fee is not higher than before"
      )
    })
    it("checks that trades documented from a previous trade are deleted and not considered for a new batchIndex", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10000, feeSubtracted(5000)]
      const tokenIdsForPrice = [1]


      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")

      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), bT.deposit1 - 2 * volume[0], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_2.address)).toNumber(), 2 * feeSubtracted(volume[0] * prices[1] / prices[0]), "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), bT.deposit2 - 2 * volume[1], "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, feeToken.address)).toNumber(), 2 * feeSubtracted(volume[1] * prices[0] / prices[1]), "Bought tokens were not adjusted correctly")
    })
    it("settles a ring trade between 3 tokens", async () => {

      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)


      await stablecoinConverter.deposit(feeToken.address, 10000, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 10000, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 10000, { from: user_3 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 9990, 10000, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex + 1, 9980, 9990, { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, true, batchIndex + 1, 9970, 9980, { from: user_3 })

      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 10, 10]
      const owner = [user_1, user_2, user_3]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2, orderId3]
      const volume = [10000, 9990, 9980]
      const tokenIdsForPrice = [1, 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, feeToken.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 10, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, erc20_3.address)).toNumber(), 20, "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 9990, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_3.address), 9980, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_3, feeToken.address), 9970, "Bought tokens were not adjusted correctly")
    })
    it("throws, if the batchIndex is incorrect", async () => {

      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("throws, if order is not yet valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Order is not yet valid"
      )
    })
    it("throws, if order is no longer valid", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      // close another auction
      await waitForNSeconds(BATCH_TIME)
      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]

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

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex, bT.orderOneBuyAmount + 1, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "limit price not satisfied"
      )
    })
    it("throws, if sell volume is bigger than order volume", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex, bT.orderOneBuyAmount - 1, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [bT.orderOneSellAmount + 1, bT.orderTwoSellAmount + 1]
      const tokenIdsForPrice = [1]

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

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount - 1, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [bT.volume[0], bT.volume[1] - 1]
      const tokenIdsForPrice = [1]


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

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1 - 1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)
      )
    })
    it("reverts, if a trade touches a token, for which no price is provided in function findPriceIndex", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)


      await stablecoinConverter.deposit(feeToken.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 20, { from: user_1 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex, 5, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 2, true, batchIndex, 5, 10, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 10, 10]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 9]
      const tokenIdsForPrice = [1]

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

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [1, 1]

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

      await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = bT.prices
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = bT.volume
      const tokenIdsForPrice = [0, 1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "price for fee token should not be overwritten"
      )
    })
    it("reverts, if price of sellToken == 0", async () => {
      const feeToken = await MockContract.new()
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await feeToken.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(feeToken.address, 20, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex, 19, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 2, true, batchIndex, 8, 19, { from: user_2 })
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 19]
      const tokenIdsForPrice = [2]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "prices are not allowed to be zero"
      )
    })
  })
  it("reverts, if price of buyToken == 0", async () => {
    const feeToken = await MockContract.new()
    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)
    const erc20_2 = await MockContract.new()

    await feeToken.givenAnyReturnBool(true)
    await erc20_2.givenAnyReturnBool(true)

    await stablecoinConverter.deposit(feeToken.address, bT.deposit1, { from: user_1 })
    await stablecoinConverter.deposit(erc20_2.address, bT.deposit2, { from: user_2 })

    await stablecoinConverter.addToken(erc20_2.address)
    const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

    const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.secondToken, bT.firstToken, true, batchIndex + 1, bT.orderOneBuyAmount, bT.orderOneSellAmount, { from: user_1 })
    const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, bT.firstToken, bT.secondToken, true, batchIndex + 1, bT.orderTwoBuyAmount, bT.orderTwoSellAmount, { from: user_2 })
    // close auction
    await waitForNSeconds(BATCH_TIME)

    const prices = [0, 0]
    const owner = [user_1, user_2]  //tradeData is submitted as arrays
    const orderId = [orderId1, orderId2]
    const volume = bT.volume
    const tokenIdsForPrice = [1]

    await truffleAssert.reverts(
      stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
      "prices are not allowed to be zero"
    )
  })
})


