const MockContract = artifacts.require("MockContract")

const { closeAuction, getBalanceState } = require("../scripts/utilities.js")

const { setupGenericStableX } = require("./stablex_utils")

contract("BatchExchange utils", async (accounts) => {
  describe("getBalanceState()", async () => {
    it("retrieves balance as in storage", async () => {
      const batchExchange = await setupGenericStableX()
      await closeAuction(batchExchange)
      const erc20 = await MockContract.new()
      await erc20.givenAnyReturnBool(true)

      await batchExchange.deposit(erc20.address, 0x100)
      await closeAuction(batchExchange)
      // force balance update by creating new deposit
      await batchExchange.deposit(erc20.address, 0)

      const balance = await getBalanceState(accounts[0], erc20.address, batchExchange.address, web3)
      assert.equal(balance.toString(16), "100")
    })
  })
})
