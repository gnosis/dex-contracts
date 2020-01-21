const { closeAuction } = require("../../scripts/stablex/utilities.js")
const { solutionSubmissionParams, largeRing30 } = require("../resources/examples")
const { makeDeposits, placeOrders, setupGenericStableX } = require("./stablex_utils")

contract("BatchExchange", async accounts => {
  const solver = accounts.pop()
  const competingSolver = accounts.pop()

  describe("Large Examples [ @skip-on-coverage ]", () => {
    it("ensures hard gas limit on largest possible ring trade ", async () => {
      const batchExchange = await setupGenericStableX(30)
      const sixPointFiveMillion = 6500000

      const tradeExample = largeRing30
      // Deposit double sufficient amount and immediately request withdraw for half
      await makeDeposits(batchExchange, accounts, tradeExample.deposits)
      for (const order of tradeExample.orders) {
        const tokenAddress = await batchExchange.tokenIdToAddressMap.call(order.buyToken)
        await batchExchange.requestWithdraw(tokenAddress, order.buyAmount, { from: accounts[order.user] })
      }
      await closeAuction(batchExchange)

      const batchId = (await batchExchange.getCurrentBatchId.call()).toNumber()
      const orderIds = await placeOrders(batchExchange, accounts, tradeExample.orders, batchId + 1)
      await closeAuction(batchExchange)

      // Ensure that first 30 orders have valid withdraw requests.
      for (const order of tradeExample.orders.slice(0, 30)) {
        const tokenAddress = await batchExchange.tokenIdToAddressMap.call(order.buyToken)
        assert(
          await batchExchange.hasValidWithdrawRequest.call(accounts[order.user], tokenAddress),
          true,
          "Expected valid withdraw requests before first solution submission."
        )
      }

      const solution = solutionSubmissionParams(tradeExample.solutions[0], accounts, orderIds)
      const firstSubmissionTX = await batchExchange.submitSolution(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver }
      )
      assert(
        firstSubmissionTX.receipt.gasUsed < sixPointFiveMillion,
        `Solution submission exceeded 6.5 million gas at ${firstSubmissionTX.receipt.gasUsed}`
      )

      // Ensure second 30 order's users valid withdraw requests.
      for (const order of tradeExample.orders.slice(30)) {
        const tokenAddress = await batchExchange.tokenIdToAddressMap.call(order.buyToken)
        assert(await batchExchange.hasValidWithdrawRequest.call(accounts[order.user], tokenAddress), true)
      }

      const solution2 = solutionSubmissionParams(tradeExample.solutions[1], accounts, orderIds)
      const secondSubmissionTX = await batchExchange.submitSolution(
        batchId,
        solution2.objectiveValue,
        solution2.owners,
        solution2.touchedorderIds,
        solution2.volumes,
        solution2.prices,
        solution2.tokenIdsForPrice,
        { from: competingSolver }
      )
      assert(
        secondSubmissionTX.receipt.gasUsed < sixPointFiveMillion,
        `Competing solution submission exceeded 6.5 million gas at ${secondSubmissionTX.receipt.gasUsed}`
      )
    })
  })
})
