const BatchAuction = artifacts.require("BatchAuction")
const ERC20 = artifacts.require("ERC20")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const zeroHash = "0x0"
const oneHash = "0x1"

const {
  assertRejects,
  waitForNBlocks,
  fundAccounts,
  approveContract,
  // openAccounts,
  // registerTokens,
  setupEnvironment } = require("./utilities.js")

contract("BatchAuction", async (accounts) => {
  const [owner, token_owner, user_1, user_2] = accounts
  
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

      assert.equal((await instance.tokenAddresToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await instance.tokenIdToAddressMap.call(1), token_1.address)

      const token_2 = await ERC20.new()
      await instance.addToken(token_2.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await instance.tokenIdToAddressMap.call(2), token_2.address)
    })

    it("Nobody else can add tokens", async () => {
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

  describe("deposit()", () => {
    it("No deposit by unregistered address", async () => {
      const instance = await BatchAuction.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      
      await assertRejects(instance.deposit(token_index, 0))
    })

    it("No deposit with failed transfer (insufficeint funds)", async () => {
      const instance = await BatchAuction.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      
      await assertRejects(instance.deposit(token_index, 1, { from: user_1 }))
    })

    it("No deposit unregistered token", async () => {
      const instance = await BatchAuction.new()
      const num_tokens = (await instance.numTokens.call()).toNumber()
      await instance.openAccount(1, { from: user_1 })
      await assertRejects(instance.deposit(num_tokens + 1, 1, { from: user_1 }))
    })

    it("No deposit 0", async () => {
      const instance = await BatchAuction.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await assertRejects(instance.deposit(token_index, 0, { from: user_1 }))
    })

    it("Generic Deposit", async () => {
      const instance = await BatchAuction.new()
      const token = await MintableERC20.new()
      const token_index = 1

      // fund accounts and approve contract for transfers
      await fundAccounts(owner, accounts, token, 100)
      await approveContract(instance, accounts, token, 100)

      await instance.addToken(token.address)
      await instance.openAccount(token_index, { from: user_1 })

      // user 1 deposits 10
      await instance.deposit(token_index, 10, { from: user_1 })
      const deposit_slot = (await instance.depositIndex.call()).toNumber()
      assert.notEqual((await instance.depositHashes(deposit_slot)).shaHash, 0)
    })

    it("Deposits over consecutive slots", async () => {
      const instance = await BatchAuction.new()
      const token = await MintableERC20.new()
      const token_index = 1
      
      // fund accounts and approve contract for transfers
      await fundAccounts(owner, accounts, token, 100)
      await approveContract(instance, accounts, token, 100)

      await instance.addToken(token.address)
      await instance.openAccount(token_index, { from: user_1 })

      await waitForNBlocks(20, owner)
      // First deposit slot is missed (i.e. empty)
      assert.equal((await instance.depositHashes(0)).shaHash, 0)

      // user 1 deposits 10
      await instance.deposit(token_index, 10, { from: user_1 })
      const deposit_slot = Math.floor(await web3.eth.getBlockNumber()/20)
      assert.notEqual((await instance.depositHashes(deposit_slot)).shaHash, 0)
      assert.equal((await instance.depositHashes(deposit_slot)).applied, false)

      // wait for another 20 blocks and deposit again
      await waitForNBlocks(20, owner)
      await instance.deposit(token_index, 10, { from: user_1 })

      assert.notEqual((await instance.depositHashes(deposit_slot + 1)).shaHash, 0)
    })
  })

  describe("applyDeposits()", () => {
    it("Only owner can apply deposits", async () => {
      const instance = await BatchAuction.new()

      const deposit_index = (await instance.depositIndex.call()).toNumber()
      const deposit_hash = (await instance.depositHashes.call(deposit_index)).shaHash
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)

      await assertRejects(instance.applyDeposits(0, deposit_hash, state_root, oneHash, { from: user_1 }))
    })

    it("No apply deposit on active slot", async () => {
      const instance = await BatchAuction.new()
      
      const deposit_index = (await instance.depositIndex.call()).toNumber()
      const deposit_hash = (await instance.depositHashes.call(deposit_index)).shaHash
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      
      await assertRejects(instance.applyDeposits(deposit_index, deposit_hash, state_root, oneHash))
    })

    it("Can't apply on empty slot", async () => {
      const instance = await BatchAuction.new()
      await setupEnvironment(instance, token_owner, accounts, 1)

      await instance.deposit(1, 10, { from: user_1 })
      const deposit_index = (await instance.depositIndex.call()).toNumber()
      await waitForNBlocks(20, owner)

      await assertRejects(instance.applyDeposits(deposit_index, zeroHash, zeroHash, zeroHash))
    })

    it("Can't apply with wrong depositHash", async () => {
      const instance = await BatchAuction.new()
      
      await setupEnvironment(instance, token_owner, accounts, 2)

      await instance.deposit(1, 10, { from: user_1 })
      const deposit_index = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)

      await assertRejects(instance.applyDeposits(deposit_index, zeroHash, state_root, zeroHash))
    })

    it("Can't apply with wrong stateRoot", async () => {
      const instance = await BatchAuction.new()
      
      await setupEnvironment(instance, token_owner, accounts, 2)

      await instance.deposit(1, 10, { from: user_1 })
      const deposit_slot = Math.floor(await web3.eth.getBlockNumber()/20)

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const deposit_hash = (await instance.depositHashes.call(deposit_slot)).shaHash

      await assertRejects(
        instance.applyDeposits(deposit_slot, deposit_hash, oneHash, zeroHash))
    })

    it("successful apply deposit", async () => {
      const instance = await BatchAuction.new()
      
      await setupEnvironment(instance, token_owner, accounts, 2)

      // user 1 and 2 both deposit 10 of token 1 and 2
      await instance.deposit(1, 10, { from: user_1 })
      await instance.deposit(2, 10, { from: user_1 })
      await instance.deposit(1, 10, { from: user_2 })
      await instance.deposit(2, 10, { from: user_2 })
      const deposit_slot = Math.floor(await web3.eth.getBlockNumber()/20)

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const deposit_hash = (await instance.depositHashes.call(deposit_slot)).shaHash
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)

      await instance.applyDeposits(deposit_slot, deposit_hash, state_root, zeroHash)
      
      assert.equal((await instance.depositHashes.call(deposit_slot)).applied, true)
    })

    it("can't apply deposits twice", async () => {
      const instance = await BatchAuction.new()
      await setupEnvironment(instance, token_owner, accounts, 2)

      await instance.deposit(1, 10, { from: user_1 })
      const deposit_slot = Math.floor(await web3.eth.getBlockNumber()/20)

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const deposit_hash = (await instance.depositHashes.call(deposit_slot)).shaHash
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)

      await instance.applyDeposits(deposit_slot, deposit_hash, state_root, zeroHash)
      
      // Fail to apply same deposit twice
      await assertRejects(
        instance.applyDeposits(deposit_slot, deposit_hash, state_root, zeroHash))
    })
  })
})