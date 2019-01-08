const BatchAuction = artifacts.require("BatchAuction")
const ERC20 = artifacts.require("ERC20")

const { assertRejects } = require("./utilities.js")

contract("BatchAuction", async (accounts) => {
  const [owner, user_1, user_2] = accounts
  
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
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await assertRejects(instance.openAccount(max_account_id + 1))
    })

    it("Do allow open account at index = maxAccountNumber", async () => {
      const instance = await BatchAuction.new()
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await instance.openAccount(max_account_id)
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
      await instance.openAccount(account_index)

      // Account owner can't open another
      await assertRejects(instance.openAccount(account_index))

      // Others can't open another
      await assertRejects(instance.openAccount(account_index, { from: user_1}))
    })

    it("Open multiple accounts", async () => {
      const instance = await BatchAuction.new()
      
      for (let i = 0; i < accounts.length; i++) {
        await instance.openAccount(i+1, { from: accounts[i] })

        assert.equal(i+1, (await instance.publicKeyToAccountMap.call(accounts[i])).toNumber())
        assert.equal(accounts[i], await instance.accountToPublicKeyMap.call(i+1))
      }
    })
  })

  describe("addToken()", () => {
    it("Owner can add tokens", async () => {
      const instance = await BatchAuction.new()

      const token_1 = await ERC20.new()
      await instance.addToken(token_1.address)
      instance.addToken(token_1.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await instance.tokenIdToAddressMap.call(1), token_1.address)

      const token_2 = await ERC20.new()
      await instance.addToken(token_2.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await instance.tokenIdToAddressMap.call(2), token_2.address)
    })

    it("Nobody Else can add tokens", async () => {
      const instance = await BatchAuction.new()
      const token = await ERC20.new()

      await assertRejects(instance.addToken(token.address, {from: user_1}))
      await assertRejects(instance.addToken(token.address, {from: user_2}))
    })

    it("Can't add same token twice", async () => {
      const instance = await BatchAuction.new()
      const token = await ERC20.new()

      await instance.addToken(token.address)
      await assertRejects(instance.addToken(token.address))
    })

    it("Can't exceed max tokens", async () => {
      const instance = await BatchAuction.new()
      const max_tokens = (await instance.MAX_TOKENS.call()).toNumber()

      for (let i = 1; i < max_tokens + 1; i++) {
        await instance.addToken((await ERC20.new()).address)
      }
      // Last token can't be added (exceeds limit)
      await assertRejects(instance.addToken((await ERC20.new()).address))
    })

  })
})
