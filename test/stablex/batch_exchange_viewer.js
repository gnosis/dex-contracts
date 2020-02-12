const BatchExchange = artifacts.require("BatchExchange")
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")
const MockContract = artifacts.require("MockContract")

const { decodeAuctionElements } = require("../utilities")
const { closeAuction } = require("../../scripts/stablex/utilities.js")

const zero_address = "0x0000000000000000000000000000000000000000"

contract("BatchExchangeViewer", accounts => {
  let batchExchange, token_1, token_2
  beforeEach(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

    token_1 = await MockContract.new()
    token_2 = await MockContract.new()
    await batchExchange.addToken(token_1.address)
    await batchExchange.addToken(token_2.address)
  })

  describe("getBalances", () => {
    it("returns all listed tokens", async () => {
      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getBalances(accounts[0])
      assert.equal(result.filter(balance => balance.availableSellAmount == 0).length, 3)
    })

    it("returns pending deposits", async () => {
      await token_1.givenAnyReturnBool(true)
      await batchExchange.deposit(token_1.address, 100)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getBalances(accounts[0])
      assert.equal(result[1].pendingDeposit, 100)
    })

    it("returns available balance once deposit is processed", async () => {
      await token_1.givenAnyReturnBool(true)
      await batchExchange.deposit(token_1.address, 100)
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getBalances(accounts[0])
      assert.equal(result[1].pendingDeposit, 0)
      assert.equal(result[1].availableSellAmount, 100)
    })

    it("returns withdrawable balance once it is claimable", async () => {
      await token_1.givenAnyReturnBool(true)
      await batchExchange.deposit(token_1.address, 100)
      await closeAuction(batchExchange)
      await batchExchange.requestWithdraw(token_1.address, 100)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const before_valid = await viewer.getBalances(accounts[0])
      assert.equal(before_valid[1].availableSellAmount, 100)
      assert.equal(before_valid[1].withdrawableBalance, 0)

      await closeAuction(batchExchange)

      const after_valid = await viewer.getBalances(accounts[0])
      assert.equal(after_valid[1].availableSellAmount, 0)
      assert.equal(after_valid[1].withdrawableBalance, 100)
    })

    it("reports withdrawable balance higher than available balance", async () => {
      // Due to https://github.com/gnosis/dex-contracts/issues/539
      await token_1.givenAnyReturnBool(true)
      await batchExchange.deposit(token_1.address, 100)
      await batchExchange.requestWithdraw(token_1.address, 200)
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getBalances(accounts[0])
      assert.equal(result[1].withdrawableBalance, 200)
    })
  })

  describe("getOpenOrderBook", () => {
    it("can be queried without pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId + 5), //validFrom
        Array(10).fill(batchId + 5), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeAuctionElements(await viewer.getOpenOrderBook([]))
      assert.equal(result.filter(e => e.validFrom == batchId).length, 10)
    })
    it("can be queried with pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId + 5), //validFrom
        Array(10).fill(batchId + 5), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getOpenOrderBookPaginated([], zero_address, 0, 5)
      assert.equal(decodeAuctionElements(result.elements).filter(e => e.validFrom == batchId).length, 5)
      assert.equal(result.nextPageUser, accounts[0])
      assert.equal(result.nextPageUserOffset, 15)
    })
    it("can filter a token pair", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(3).fill(0), //buyToken
        Array(3).fill(1), //sellToken
        Array(3).fill(batchId), //validFrom
        Array(3).fill(batchId), //validTo
        Array(3).fill(0), //buyAmounts
        Array(3).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(5).fill(1), //buyToken
        Array(5).fill(2), //sellToken
        Array(5).fill(batchId), //validFrom
        Array(5).fill(batchId), //validTo
        Array(5).fill(0), //buyAmounts
        Array(5).fill(0) //sellAmounts
      )
      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeAuctionElements(await viewer.getOpenOrderBook([token_1.address, token_2.address]))
      assert.equal(result.filter(e => e.validFrom == batchId).length, 5)
    })
  })

  describe("getFinalizedOrderBook", () => {
    it("can be queried without pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId + 5), //validFrom
        Array(10).fill(batchId + 5), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )

      // finalize order book
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeAuctionElements(await viewer.getFinalizedOrderBook([]))
      assert.equal(result.filter(e => e.validFrom == batchId).length, 10)
    })
    it("can be queried with pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId + 5), //validFrom
        Array(10).fill(batchId + 5), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0) //sellAmounts
      )

      // finalize order book
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getFinalizedOrderBookPaginated([], zero_address, 0, 5)
      assert.equal(decodeAuctionElements(result.elements).filter(e => e.validFrom == batchId).length, 5)
      assert.equal(result.nextPageUser, accounts[0])
      assert.equal(result.nextPageUserOffset, 15)
    })
    it("can filter a token pair", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeValidFromOrders(
        Array(3).fill(0), //buyToken
        Array(3).fill(1), //sellToken
        Array(3).fill(batchId), //validFrom
        Array(3).fill(batchId), //validTo
        Array(3).fill(0), //buyAmounts
        Array(3).fill(0) //sellAmounts
      )
      await batchExchange.placeValidFromOrders(
        Array(5).fill(1), //buyToken
        Array(5).fill(2), //sellToken
        Array(5).fill(batchId), //validFrom
        Array(5).fill(batchId), //validTo
        Array(5).fill(0), //buyAmounts
        Array(5).fill(0) //sellAmounts
      )

      // finalize order book
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeAuctionElements(await viewer.getFinalizedOrderBook([token_1.address, token_2.address]))
      assert.equal(result.filter(e => e.validFrom == batchId).length, 5)
    })
  })
})
