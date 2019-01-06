const BatchAuction = artifacts.require("BatchAuction")

const { assertRejects } = require("./utilities.js")

contract("BatchAuction", async (accounts) => {
  const [owner, user_1] = accounts
  
  describe("openAccount()", () => {
    it("Account index default is 0", async () => {
      const instance = await BatchAuction.new()
      const account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
      assert.equal(account_index, 0)
    })

    it("Don't allow open account at 0", async () => {
      const instance = await BatchAuction.new()
      await assertRejects(instance.openAccount(0))
    })

    it("Do not allow open account at index > maxAccountNumber", async () => {
      const instance = await BatchAuction.new()
      const max_account_id = (await instance.maxAccountNumber.call()).toNumber()
      await assertRejects(instance.openAccount(max_account_id + 1))
    })

    it("Do allow open account at index = maxAccountNumber", async () => {
      const instance = await BatchAuction.new()
      const max_account_id = (await instance.maxAccountNumber.call()).toNumber()
      instance.openAccount(max_account_id)
      assert.equal(max_account_id, (await instance.publicKeyToAccountMap.call(owner)).toNumber())
    })

    it("Open Account at index 1", async () => {
      const instance = await BatchAuction.new()
      
      // Open Account
      await instance.openAccount(1)
      
      // Account index is as requested
      const account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
      assert.equal(account_index, 1)

      // Public key corresponds to account index
      const account_owner = await instance.accountToPublicKeyMap.call(1)
      assert.equal(account_owner, owner)
    })

    it("Can't open two accounts at same index", async () => {
      const instance = await BatchAuction.new()
      const account_index = 1
      instance.openAccount(account_index)

      // Account owner can't open another
      await assertRejects(instance.openAccount(account_index))

      // Others can't open another
      await assertRejects(instance.openAccount(account_index, { from: user_1}))
    })

    it("Open multiple accounts", async () => {
      const instance = await BatchAuction.new()
      
      for (let i = 0; i < accounts.length; i++) {
        instance.openAccount(i+1, { from: accounts[i] })

        assert.equal(i+1, (await instance.publicKeyToAccountMap.call(accounts[i])).toNumber())
        assert.equal(accounts[i], await instance.accountToPublicKeyMap.call(i+1))
      }
    })
  })
})