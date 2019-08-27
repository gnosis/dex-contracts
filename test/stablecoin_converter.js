const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const ERC20 = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue } = require("./utilities.js")


contract("StablecoinConverter", async (accounts) => {

  const [user_1, user_2, user_3] = accounts
  let BATCH_TIME
  beforeEach(async () => {
    const lib1 = await IdToAddressBiMap.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)

    const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })

  describe("placeOrder", () => {
    it("places Orders and checks parameters", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
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
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)

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
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder(id)

      assert.equal((await stablecoinConverter.orders(user_1, id)).sellAmount, 0, "sellAmount was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
  })
  describe("addToken()", () => {
    it("Anyone can add tokens", async () => {
      const instance = await StablecoinConverter.new(2 ** 16 - 1)

      const token_1 = await ERC20.new()
      await instance.addToken(token_1.address)

      assert.equal((await instance.tokenAddressToIdMap.call(token_1.address)).toNumber(), 0)
      assert.equal(await instance.tokenIdToAddressMap.call(0), token_1.address)
      const token_2 = await ERC20.new()
      await instance.addToken(token_2.address)

      assert.equal((await instance.tokenAddressToIdMap.call(token_2.address)).toNumber(), 1)
      assert.equal(await instance.tokenIdToAddressMap.call(1), token_2.address)
    })

    it("Reject: add same token twice", async () => {
      const instance = await StablecoinConverter.new(2 ** 16 - 1)
      const token = await ERC20.new()

      await instance.addToken(token.address)
      await truffleAssert.reverts(instance.addToken(token.address), "Token already registered")
    })

    it("No exceed max tokens", async () => {
      const instance = await StablecoinConverter.new(2)
      await instance.addToken((await ERC20.new()).address)
      await instance.addToken((await ERC20.new()).address)

      await truffleAssert.reverts(instance.addToken((await ERC20.new()).address), "Max tokens reached")
    })
  })
  describe("submitSolution()", () => {
    it("places two orders and matches them in a solution with traders' Utility == 0", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 20]


      const tokenIdsForPrice = [0, 1]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_1.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 20, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_1.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
    })
    it("places two orders and matches them in a solution with traders' Utility >0", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 10, 20, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 20, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 10]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 10]


      const tokenIdsForPrice = [0, 1]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_1.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_1.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 10, "Sold tokens were not adjusted correctly")
    })
    it("places two orders, matches them partically and then checks correct order adjustments", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex + 1, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [5, 10]
      const tokenIdsForPrice = [0, 1]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_1.address)).toNumber(), 5, "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_1.address), 5, "Bought tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 10, "Sold tokens were not adjusted correctly")
      const orderResult1 = (await stablecoinConverter.orders.call(user_1, orderId1))
      const orderResult2 = (await stablecoinConverter.orders.call(user_2, orderId2))

      assert.equal((orderResult1.sellAmount).toNumber(), 5, "sellAmount was stored incorrectly")
      assert.equal((orderResult1.buyAmount).toNumber(), 10, "buyAmount was stored incorrectly")

      assert.equal((orderResult2.sellAmount).toNumber(), 10, "sellAmount was stored incorrectly")
      assert.equal((orderResult2.buyAmount).toNumber(), 5, "buyAmount was stored incorrectly")
    })
    it("settles a ring trade between 3 tokens", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()
      const erc20_3 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)
      await erc20_3.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 10, { from: user_2 })
      await stablecoinConverter.deposit(erc20_3.address, 10, { from: user_3 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      await stablecoinConverter.addToken(erc20_3.address)

      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex + 1, 10, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 2, 1, true, batchIndex + 1, 10, 10, { from: user_2 })
      const orderId3 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 2, true, batchIndex + 1, 10, 10, { from: user_3 })

      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 10, 10]
      const owner = [user_1, user_2, user_3]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2, orderId3]
      const volume = [10, 10, 10]
      const tokenIdsForPrice = [0, 1, 2]

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)

      assert.equal((await stablecoinConverter.getBalance.call(user_1, erc20_1.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_2, erc20_2.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal((await stablecoinConverter.getBalance.call(user_3, erc20_3.address)).toNumber(), 0, "Sold tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_1, erc20_2.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_2, erc20_3.address), 10, "Bought tokens were not adjusted correctly")
      assert.equal(await stablecoinConverter.getBalance.call(user_3, erc20_1.address), 10, "Bought tokens were not adjusted correctly")
    })
    it("throws, if the batchIndex is incorrect", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)

      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [5, 10]


      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Solutions are no longer accepted for this batch"
      )
    })
    it("throws, if order is not yet valid", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })

      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [5, 10]


      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex - 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Order is not yet valid"
      )
    })
    it("throws, if order is no longer valid", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      // close another auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [5, 10]


      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex + 1, owner, orderId, volume, prices, tokenIdsForPrice),
        "Order is no longer valid"
      )
    })
    it("throws, if limit price is not met for an order", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 21, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [5, 10]


      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "limit price not satisfied"
      )
    })
    it("throws, if sell volume is bigger than order volume", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [11, 10]


      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "executedSellAmount bigger than specified in order"
      )
    })
    it("throws, if sell volume is bigger than balance available", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 8, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 20]

      const tokenIdsForPrice = [0, 1]

      //correct batchIndex would be batchIndex
      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice)//,
      )
    })
    it("reverts, if a trade touches a token, for which no price is provided", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1)
      const erc20_1 = await MockContract.new()
      const erc20_2 = await MockContract.new()

      await erc20_1.givenAnyReturnBool(true)
      await erc20_2.givenAnyReturnBool(true)

      await stablecoinConverter.deposit(erc20_1.address, 10, { from: user_1 })
      await stablecoinConverter.deposit(erc20_2.address, 20, { from: user_2 })

      await stablecoinConverter.addToken(erc20_1.address)
      await stablecoinConverter.addToken(erc20_2.address)
      const batchIndex = (await stablecoinConverter.getCurrentStateIndex.call()).toNumber()

      const orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 1, 0, true, batchIndex, 20, 10, { from: user_1 })
      const orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, batchIndex, 10, 20, { from: user_2 })
      // close auction
      await waitForNSeconds(BATCH_TIME)
      const prices = [10, 20]
      const owner = [user_1, user_2]  //tradeData is submitted as arrays
      const orderId = [orderId1, orderId2]
      const volume = [10, 20]
      const tokenIdsForPrice = [1, 1]

      await truffleAssert.reverts(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice),
        "prices are not allowed to be zero"
      )
    })
  })
})


