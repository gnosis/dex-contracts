const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const SnappBaseCore = artifacts.require("SnappBaseCore")
const MultiRequest = artifacts.require("MultiRequest")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const { setupEnvironment } = require("./utilities.js")

contract("MultiRequest", async (accounts) => {
  const [token_owner, user_1] = accounts

  beforeEach(async () => {
    const lib1 = await IdToAddressBiMap.new()
    
    await SnappBaseCore.link(IdToAddressBiMap, lib1.address)
    const lib2 = await SnappBaseCore.new()

    await MultiRequest.link(IdToAddressBiMap, lib1.address)
    await MultiRequest.link(SnappBaseCore, lib2.address)
  })

  describe("Test full request batches", () => {
    it("full deposit", async () => {
      const instance = await MultiRequest.new()
      const core = await SnappBaseCore.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      const batchSize = (await core.depositBatchSize.call()).toNumber()
      await instance.multiDeposit(1, 1, batchSize, { from: user_1 })
      const index_0 = (await instance.getCurrentDepositIndex.call()).toNumber()
      assert.equal(index_0, 0)

      await instance.deposit(1, 1, { from: user_1 })
      const index_1 = await instance.getCurrentDepositIndex.call()
      assert.equal(index_1.toNumber(), 1)
    })

    it("full withdraw", async () => {
      const instance = await MultiRequest.new()
      const core = await SnappBaseCore.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      
      // Must deposit before withdraw so contract has sufficient balance 
      await instance.deposit(1, 1, { from: user_1 })

      const batchSize = (await core.withdrawBatchSize.call()).toNumber()
      await instance.multiWithdraw(1, 1, batchSize, { from: user_1 })
      const index_0 = (await instance.getCurrentWithdrawIndex.call()).toNumber()
      assert.equal(index_0, 0)
      
      await instance.requestWithdrawal(1, 1, { from: user_1 })
      const index_1 = (await instance.getCurrentWithdrawIndex.call()).toNumber()
      assert.equal(index_1, 1)
    })
  })
})