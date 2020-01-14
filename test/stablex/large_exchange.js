const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")

const { closeAuction } = require("../../scripts/stablex/utilities.js")

const { longRingTrade, solutionSubmissionParams } = require("../resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

contract("BatchExchange", async accounts => {
  const solver = accounts.pop()
  const competingSolver = accounts.pop()

  let MAX_TOUCHED_ORDERS
  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link(IdToAddressBiMap, lib1.address)
    await BatchExchange.link(IterableAppendOnlySet, lib2.address)
    const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

    MAX_TOUCHED_ORDERS = (await batchExchange.MAX_TOUCHED_ORDERS.call()).toNumber()
  })

  // In the following tests, it might be possible that an batchId is read from the blockchain
  // and in the next moment this batchId is no longer the current one. In order to prevent these
  // situations, we set the adjust the start-time of each test to the start of an new auction.
  beforeEach(async () => {
    const batchExchange = await BatchExchange.deployed()
    await closeAuction(batchExchange)
  })

  describe("Large Ring Trade", () => {
    it("invalidates valid order as of next batch", async () => {
      const batchExchange = await setupGenericStableX(MAX_TOUCHED_ORDERS)

      await makeDeposits(batchExchange, accounts, longRingTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, longRingTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(longRingTrade.solutions[0], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      const solution2 = solutionSubmissionParams(longRingTrade.solutions[1], accounts, orderIds)
      await batchExchange.submitSolution(
        batchId,
        solution2.objectiveValue,
        solution2.owners,
        solution2.touchedorderIds,
        solution2.volumes,
        solution2.prices,
        solution2.tokenIdsForPrice,
        { from: competingSolver }
      )
    })
  })
})
