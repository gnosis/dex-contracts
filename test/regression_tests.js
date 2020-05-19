const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")

const BN = require("bn.js")
const truffleAssert = require("truffle-assertions")

const { closeAuction } = require("../scripts/utilities")

const { solutionSubmissionParams, basicTrade, utilityOverflow } = require("../build/common/test/resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

contract("BatchExchange", async (accounts) => {
  const solver = accounts[0]

  before(async () => {
    const feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link("IdToAddressBiMap", lib1.address)
    await BatchExchange.link("IterableAppendOnlySet", lib2.address)
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
    it("Should not allow to use claimable withdraws in solution", async () => {
      const batchExchange = await setupGenericStableX()

      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const firstOrder = basicTrade.orders[0]
      const tokenAddress = await batchExchange.tokenIdToAddressMap.call(firstOrder.sellToken)
      const attackerAddress = accounts[firstOrder.user]

      await batchExchange.requestWithdraw(tokenAddress, firstOrder.sellAmount, { from: attackerAddress })
      await closeAuction(batchExchange)
      // Ensure withdraw is claimable.
      assert(await batchExchange.hasValidWithdrawRequest.call(attackerAddress, tokenAddress), true)
      assert(await batchExchange.getBalance.call(attackerAddress, tokenAddress), 0)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)

      await closeAuction(batchExchange)
      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      await truffleAssert.reverts(
        batchExchange.submitSolution.call(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver }
        ),
        "Amount exceeds user's balance"
      )
    })
    it("[Ramified Basic Trade] Touches one order twice in the same solution.", async () => {
      const batchExchange = await setupGenericStableX()

      // Make deposits, place orders and close auction[aka runAuctionScenario(basicTrade)]
      await makeDeposits(batchExchange, accounts, basicTrade.deposits)
      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, basicTrade.orders, batchId + 1)
      await closeAuction(batchExchange)

      const solution = solutionSubmissionParams(basicTrade.solutions[0], accounts, orderIds)

      // Modifying owners so that last owner appears twice.
      // That is, owners = [owner1, owner2, ... ownerN, ownerN]
      solution.owners.push(solution.owners.slice(-1)[0])
      // Modifying touched orders so that last orderID appears twice.
      solution.touchedorderIds.push(solution.touchedorderIds.slice(-1)[0])
      // Replace the last element of the basic trade volume with two coppies of half of it.
      const lastVolume = solution.volumes.slice(-1)[0]
      const ramifiedVolumes = solution.volumes.slice(0, -1).concat([lastVolume.divn(2), lastVolume.divn(2)])

      const ramifiedSolution = {
        objectiveValue: solution.objectiveValue,
        owners: solution.owners,
        touchedorderIds: solution.touchedorderIds,
        volumes: ramifiedVolumes,
        prices: solution.prices,
        tokenIdsForPrice: solution.tokenIdsForPrice,
      }
      const objectiveValue = await batchExchange.submitSolution.call(
        batchId,
        ramifiedSolution.objectiveValue,
        ramifiedSolution.owners,
        ramifiedSolution.touchedorderIds,
        ramifiedSolution.volumes,
        ramifiedSolution.prices,
        ramifiedSolution.tokenIdsForPrice,
        { from: solver }
      )
      // Assertion that previous transaction passed.
      assert(objectiveValue > 0, "the computed objective value is greater than 0")
    })
  })
})
