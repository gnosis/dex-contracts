const StablecoinConverter = artifacts.require("StablecoinConverter")

const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const ERC20 = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const {
  waitForNSeconds,
  sendTxAndGetReturnValue } = require("./utilities.js")


contract("StablecoinConverter", async (accounts) => {

  const [user_1] = accounts 
  let BATCH_TIME
  beforeEach(async () => {
    const lib1 = await IdToAddressBiMap.new()
    await StablecoinConverter.link(IdToAddressBiMap, lib1.address)

    const stablecoinConverter = await StablecoinConverter.new(2**16-1)
    BATCH_TIME = (await stablecoinConverter.BATCH_TIME.call()).toNumber()
  })

  describe("placeOrder", () => { 
    it("places Orders and checks parameters", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2**16-1)
      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()
      const id = await stablecoinConverter.placeOrder.call(0, 1, true, 3, 10, 20, {from: user_1})
      await stablecoinConverter.placeOrder(0, 1, true, 3, 10, 20, {from: user_1})
      const orderResult = (await stablecoinConverter.orders.call(user_1,id))
      assert.equal((orderResult.sellAmount).toNumber(), 20, "sellAmount was stored incorrectly")
      assert.equal((orderResult.buyAmount).toNumber(), 10, "buyAmount was stored incorrectly")
      assert.equal((orderResult.sellToken).toNumber(), 1, "sellToken was stored incorrectly")
      assert.equal((orderResult.buyToken).toNumber(), 0, "buyToken was stored incorrectly")
      assert.equal(orderResult.sellOrderFlag, true, "sellTokenFlag was stored incorrectly")
      assert.equal((orderResult.validFrom).toNumber(), currentStateIndex.toNumber() + 1, "validFrom was stored incorrectly")
      assert.equal((orderResult.validUntil).toNumber(), 3, "validUntil was stored incorrectly")
    })
  })
  describe("cancelOrder", () => {
    it("places orders, then cancels it and orders status", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2**16-1)

      const id = await stablecoinConverter.placeOrder.call(0, 1, true, 3, 10, 20, {from: user_1})
      await stablecoinConverter.placeOrder(0, 1, true, 3, 10, 20, {from: user_1})
      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()
      await stablecoinConverter.cancelOrder(id, {from: user_1})

      assert.equal(((await stablecoinConverter.orders.call(user_1,id)).validUntil).toNumber(), currentStateIndex, "validUntil was stored incorrectly")
    })
  })
  describe("freeStorageOfOrder", () => {
    it("places a order, then cancels and deletes it", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2**16-1)

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await waitForNSeconds(BATCH_TIME)
      await stablecoinConverter.freeStorageOfOrder(id)

      assert.equal((await stablecoinConverter.orders(user_1, id)).sellAmount, 0, "sellAmount was stored incorrectly")
    })
    it("fails to delete non-canceled order", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2**16-1)
      const currentStateIndex = await stablecoinConverter.getCurrentStateIndex()

      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, currentStateIndex + 3, 10, 20)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
    it("fails to delete canceled order in same stateIndex", async () => {
      const stablecoinConverter = await StablecoinConverter.new(2**16-1)
    
      const id = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, 0, 1, true, 3, 10, 20)
      await stablecoinConverter.cancelOrder(id)
      await truffleAssert.reverts(stablecoinConverter.freeStorageOfOrder(id), "Order is still valid")
    })
  })
  describe("addToken()", () => {
    it("Anyone can add tokens", async () => {
      const instance = await StablecoinConverter.new(2**16-1)

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
      const instance = await StablecoinConverter.new(2**16-1)
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
})


