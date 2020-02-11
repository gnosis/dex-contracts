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
      const result = decodeAuctionElements(await viewer.getOpenOrderBook())
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
      const result = await viewer.getOpenOrderBookPaginated(zero_address, 0, 5)
      assert.equal(decodeAuctionElements(result.elements).filter(e => e.validFrom == batchId).length, 5)
      assert.equal(result.nextPageUser, accounts[0])
      assert.equal(result.nextPageUserOffset, 15)
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
      const result = decodeAuctionElements(await viewer.getFinalizedOrderBook())
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
      const result = await viewer.getFinalizedOrderBookPaginated(zero_address, 0, 5)
      assert.equal(decodeAuctionElements(result.elements).filter(e => e.validFrom == batchId).length, 5)
      assert.equal(result.nextPageUser, accounts[0])
      assert.equal(result.nextPageUserOffset, 15)
    })
  })
})
