const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")

const BN = require("bn.js")

const { closeAuction } = require("../../scripts/stablex/utilities.js")

const { solutionSubmissionParams, basicTrade, utilityOverflow } = require("../resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

contract("BatchExchange", async accounts => {
  const solver = accounts.pop()

  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link(IdToAddressBiMap, lib1.address)
    await BatchExchange.link(IterableAppendOnlySet, lib2.address)
  })

  // In the following tests, it might be possible that an batchId is read from the blockchain
  // and in the next moment this batchId is no longer the current one. In order to prevent these
  // situations, we set the adjust the start-time of each test to the start of an new auction.
  beforeEach(async () => {
    const batchExchange = await BatchExchange.deployed()
    await closeAuction(batchExchange)
  })

  describe("Regression Tests", async () => {
    it("Accepts large (> 2^128) utility evaluation", async () => {
      const batchExchange = await setupGenericStableX(3)

      await makeDeposits(batchExchange, accounts, utilityOverflow.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, utilityOverflow.orders, batchId + 1)
      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(utilityOverflow.solutions[0], accounts, orderIds)

      const objectiveValue = await batchExchange.submitSolution.call(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert(objectiveValue > new BN(2).pow(new BN(128)))
    })
    it("Consume claimable withdraw balance", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const firstOrder = basicTrade.orders[0]
      const tokenAddress = await batchExchange.tokenIdToAddressMap.call(firstOrder.sellToken)
      const attackerAddress = accounts[firstOrder.user]

      await batchExchange.requestWithdraw(tokenAddress, firstOrder.sellAmount, { from: attackerAddress })
      await closeAuction(batchExchange)
      // Ensure withdraw is claimable.
      assert(batchExchange.hasValidWithdrawRequest.call(attackerAddress, tokenAddress), true)
      
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await batchExchange.submitSolution.call(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )

      // Claim back initial deposit that has already been traded.
      await batchExchange.withdraw(attackerAddress, tokenAddress)
    })
  })
})
