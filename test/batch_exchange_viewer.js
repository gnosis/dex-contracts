const BatchExchange = artifacts.require("BatchExchange")
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")
const MockContract = artifacts.require("MockContract")

const BN = require("bn.js")
const truffleAssert = require("truffle-assertions")

const { decodeOrdersBN } = require("../src/encoding")
const { closeAuction } = require("../scripts/utilities.js")
const { setupGenericStableX } = require("./stablex_utils")

const zero_address = "0x0000000000000000000000000000000000000000"

// The contract can't be profiled with solcover as we rely on invoking a staticcall with
// minimal gas amount (which gets burned in case the call fails). Coverage adds solidity
// instructions to determine which lines were touched which increases the amount of gas used.
contract("BatchExchangeViewer [ @skip-on-coverage ]", (accounts) => {
  const [user_1, user_2, user_3] = accounts
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
    it("takes pending deposits and withdraws for the next batch into account", async () => {
      await token_2.givenAnyReturnBool(true)

      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeOrder(1, 2, batchId + 1, 200, 300)
      await batchExchange.deposit(token_2.address, 100)
      await batchExchange.requestWithdraw(token_2.address, 50)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeOrdersBN(await viewer.getOpenOrderBook([]))
      assert.equal(result[0].sellTokenBalance.toNumber(), 50)
    })
    it("does not count already matured deposits twice", async () => {
      await token_2.givenAnyReturnBool(true)

      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeOrder(1, 2, batchId + 2, 200, 300)
      await batchExchange.deposit(token_2.address, 100)
      await batchExchange.requestWithdraw(token_2.address, 50)

      // Mature the pending withdraw
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeOrdersBN(await viewer.getOpenOrderBook([]))
      assert.equal(result[0].sellTokenBalance.toNumber(), 50)
    })
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
      const result = decodeOrdersBN(await viewer.getOpenOrderBook([]))
      assert.equal(result.filter((e) => e.validFrom == batchId).length, 10)
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
      assert.equal(decodeOrdersBN(result.elements).filter((e) => e.validFrom == batchId).length, 5)
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
      const result = decodeOrdersBN(await viewer.getOpenOrderBook([token_1.address, token_2.address]))
      assert.equal(result.filter((e) => e.validFrom == batchId).length, 5)
    })
  })

  describe("getFinalizedOrderBook", () => {
    it("ignores pending deposits and withdraws for the next batch", async () => {
      await token_2.givenAnyReturnBool(true)

      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeOrder(1, 2, batchId + 1, 200, 300)
      await closeAuction(batchExchange)

      await batchExchange.deposit(token_2.address, 100)
      await batchExchange.requestWithdraw(token_2.address, 50)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = decodeOrdersBN(await viewer.getFinalizedOrderBook([]))
      assert.equal(result[0].sellTokenBalance.toNumber(), 0)
    })
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
      const result = decodeOrdersBN(await viewer.getFinalizedOrderBook([]))
      assert.equal(result.filter((e) => e.validFrom == batchId).length, 10)
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
      assert.equal(decodeOrdersBN(result.elements).filter((e) => e.validFrom == batchId).length, 5)
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
      const result = decodeOrdersBN(await viewer.getFinalizedOrderBook([token_1.address, token_2.address]))
      assert.equal(result.filter((e) => e.validFrom == batchId).length, 5)
    })
  })

  describe("getFilteredOrdersPaginated", () => [
    it("hasNextPage if pageSize is reached (regression)", async () => {
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
        Array(6).fill(1), //buyToken
        Array(6).fill(2), //sellToken
        Array(6).fill(batchId), //validFrom
        Array(6).fill(batchId), //validTo
        Array(6).fill(0), //buyAmounts
        Array(6).fill(0) //sellAmounts
      )
      const viewer = await BatchExchangeViewer.new(batchExchange.address)

      // We are querying two subpages which contain 6 elements in total, but due to our
      // page size constraint only return 5. Thus we should have a nextPage.
      const result = await viewer.getFilteredOrdersPaginated([batchId, batchId, batchId], [1, 2], zero_address, 0, 5)
      assert.equal(decodeOrdersBN(result.elements).length, 5)
      assert.equal(result.hasNextPage, true)
    }),
  ])

  describe("getEncodedOrdersPaginated", async () => {
    it("returns empty bytes when no users", async () => {
      const batchExchange = await setupGenericStableX()
      const viewer = await BatchExchangeViewer.new(batchExchange.address)

      const auctionElements = await viewer.getEncodedOrdersPaginated(zero_address, 0, 10)
      assert.equal(auctionElements, null)
    })
    it("returns three orders one per page", async () => {
      const batchExchange = await setupGenericStableX(3)
      const viewer = await BatchExchangeViewer.new(batchExchange.address)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_1 })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, { from: user_1 })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_2 })

      const firstPage = decodeOrdersBN(await viewer.getEncodedOrdersPaginated(zero_address, 0, 1))
      assert.equal(
        JSON.stringify(firstPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      const secondPage = decodeOrdersBN(await viewer.getEncodedOrdersPaginated(user_1, 1, 1))
      assert.equal(
        JSON.stringify(secondPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 1,
            sellToken: 2,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      const thirdPage = decodeOrdersBN(await viewer.getEncodedOrdersPaginated(user_1, 2, 1))
      assert.equal(
        JSON.stringify(thirdPage),
        JSON.stringify([
          {
            user: user_2.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ])
      )

      // 4th page is empty
      assert.equal(await viewer.getEncodedOrdersPaginated(user_2, 1, 1), null)
    })
    it("returns three orders when page size is overlapping users", async () => {
      const batchExchange = await setupGenericStableX(3)
      const viewer = await BatchExchangeViewer.new(batchExchange.address)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_1 })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, { from: user_1 })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_2 })

      const page = decodeOrdersBN(await viewer.getEncodedOrdersPaginated(user_1, 1, 2))
      assert.equal(page[0].user, user_1.toLowerCase())
      assert.equal(page[1].user, user_2.toLowerCase())
    })
    it("returns three orders from three users with larger page size", async () => {
      const batchExchange = await setupGenericStableX(3)
      const viewer = await BatchExchangeViewer.new(batchExchange.address)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_1 })
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, { from: user_2 })
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, { from: user_3 })

      const page = decodeOrdersBN(await viewer.getEncodedOrdersPaginated(zero_address, 0, 5))
      assert.equal(page.length, 3)
      assert.equal(page[0].user, user_1.toLowerCase())
      assert.equal(page[1].user, user_2.toLowerCase())
      assert.equal(page[2].user, user_3.toLowerCase())
    })
  })
  describe("getEncodedOrdersPaginatedWithTokenFilter", () => {
    it("Does not query balance for filtered tokens", async () => {
      await token_1.givenAnyReturnBool(true)
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeOrder(2, 1, batchId + 10, 200, 300)
      await batchExchange.deposit(token_1.address, new BN(2).pow(new BN(255)))
      await closeAuction(batchExchange)
      // getBalance(token1) now reverts due to math overflow
      await batchExchange.deposit(token_1.address, new BN(2).pow(new BN(255)))
      await closeAuction(batchExchange)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      await truffleAssert.reverts(viewer.getEncodedOrdersPaginatedWithTokenFilter([], zero_address, 0, 10))
      const result = decodeOrdersBN(await viewer.getEncodedOrdersPaginatedWithTokenFilter([0, 2], zero_address, 0, 10))
      // Filtered orders still show up as 0s to preserve order indices
      assert.equal(result.length, 1)
      assert.equal(result[0].validFrom, 0)
      assert.equal(result[0].validUntil, 0)
    })

    it("Allows filtered paginating while filtering (regression test)", async () => {
      const batchId = await batchExchange.getCurrentBatchId()
      await batchExchange.placeOrder(0, 1, batchId, 200, 300)
      await batchExchange.placeOrder(2, 1, batchId, 200, 300)

      const viewer = await BatchExchangeViewer.new(batchExchange.address)
      const result = await viewer.getFilteredOrdersPaginated([batchId, batchId, batchId], [1, 2], accounts[0], 0, 1)
      assert.equal(decodeOrdersBN(result.elements).length, 1)
    })
  })
})
