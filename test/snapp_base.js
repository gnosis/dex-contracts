const SnappBase = artifacts.require("SnappBase")
const ERC20 = artifacts.require("ERC20")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const zeroHash = "0x0"
const oneHash = "0x1"

const truffleAssert = require("truffle-assertions")

const Promise = require("es6-promise").Promise

const {
  waitForNBlocks,
  fundAccounts,
  approveContract,
  countDuplicates,
  generateMerkleTree,
  setupEnvironment } = require("./utilities.js")

const {
  isActive,
  stateHash,
  encodePacked_16_8_128 }  = require("./snapp_utils.js")

contract("SnappBase", async (accounts) => {
  const [owner, token_owner, user_1, user_2] = accounts

  describe("public view functions", () => {
    it("getCurrentStateRoot()", async () => {
      const instance = await SnappBase.new()
      // TODO - substitute this with correct initStateHash
      const state_init = 0x0
      assert.equal(await instance.getCurrentStateRoot.call(), state_init)
    })

    it("hasDepositBeenApplied(slot) == false", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.hasDepositBeenApplied.call(0), false)
    })

    it("getDepositCreationBlock(slot)", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      
      const tx = await instance.deposit(1, 1, { from: user_1 })
      assert.equal((await instance.getDepositCreationBlock.call(0)).toNumber(), tx.receipt.blockNumber)
    })

    it("getDepositHash(slot)", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.getDepositHash.call(0), 0x0)
    })

    it("hasWithdrawBeenApplied(slot) == false", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.hasWithdrawBeenApplied.call(0), false)
    })

    it("getWithdrawCreationBlock(slot)", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      
      await instance.deposit(1, 1, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })

      assert.equal((await instance.getWithdrawCreationBlock.call(0)).toNumber(), tx.receipt.blockNumber)
    })

    it("getWithdrawHash(slot)", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.getWithdrawHash.call(0), 0x0)
    })

    it("hasWithdrawBeenClaimed(slot, index)", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.hasWithdrawBeenClaimed.call(0, 0), false)
    })
    
  })
  
  describe("openAccount()", () => {
    it("Do not allow open account at index >= maxAccountNumber", async () => {
      const instance = await SnappBase.new()
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await truffleAssert.reverts(instance.openAccount(max_account_id), "Account index exceeds max")
      await truffleAssert.reverts(instance.openAccount(max_account_id + 1), "Account index exceeds max")
    })

    it("Do allow open account at 0 <= index < maxAccountNumber", async () => {
      const instance = await SnappBase.new()
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await instance.openAccount(max_account_id - 1)
      await instance.openAccount(0, { from: user_1 })

      assert.equal((await instance.publicKeyToAccountMap.call(owner)).toNumber(), max_account_id - 1)
      assert.equal((await instance.publicKeyToAccountMap.call(user_1)).toNumber(), 0)
    })

    it("Open Account at index 1", async () => {
      const instance = await SnappBase.new()
      
      // Open Account
      await instance.openAccount(1)
      
      // Account index is as requested
      const account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
      assert.equal(account_index, 1)

      // Public key corresponds to account index
      const account_owner = await instance.accountToPublicKeyMap.call(1)
      assert.equal(account_owner, owner)
    })

    it("Reject: two accounts at same index", async () => {
      const instance = await SnappBase.new()
      const account_index = 1
      await instance.openAccount(account_index)

      // Account owner can't open another
      await truffleAssert.reverts(instance.openAccount(account_index), "Address occupies slot or requested slot already taken")

      // Others can't open another
      await truffleAssert.reverts(instance.openAccount(account_index, { from: user_1 }), "Address occupies slot or requested slot already taken")
    })

    it("Open multiple accounts", async () => {
      const instance = await SnappBase.new()
      
      for (let i = 0; i < 3; i++) {
        await instance.openAccount(i+1, { from: accounts[i] })

        assert.equal(i+1, (await instance.publicKeyToAccountMap.call(accounts[i])).toNumber())
        assert.equal(accounts[i], await instance.accountToPublicKeyMap.call(i+1))
      }
    })
  })

  describe("addToken()", () => {
    it("Owner can add tokens", async () => {
      const instance = await SnappBase.new()

      const token_1 = await ERC20.new()
      await instance.addToken(token_1.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_1.address)).toNumber(), 0)
      assert.equal(await instance.tokenIdToAddressMap.call(0), token_1.address)

      const token_2 = await ERC20.new()
      await instance.addToken(token_2.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_2.address)).toNumber(), 1)
      assert.equal(await instance.tokenIdToAddressMap.call(1), token_2.address)
    })

    it("Only owner", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()

      await truffleAssert.reverts(instance.addToken(token.address, {from: user_1}))
    })

    it("Reject: add same token twice", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()

      await instance.addToken(token.address)
      await truffleAssert.reverts(instance.addToken(token.address), "Token already registered")
    })

    it("No exceed max tokens", async () => {
      const instance = await SnappBase.new()
      const max_tokens = (await instance.MAX_TOKENS.call()).toNumber()

      for (let i=0; i < max_tokens; i++) {
        await instance.addToken((await ERC20.new()).address)
      }
      // Last token can't be added (exceeds limit)
      await truffleAssert.reverts(instance.addToken((await ERC20.new()).address), "Max tokens reached")
    })
  })

  describe("deposit()", () => {
    it("No deposit by unregistered account", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      
      await truffleAssert.reverts(instance.deposit(token_index, 0), "Must have registered account")
    })

    it("Reject: unregistered token", async () => {
      const instance = await SnappBase.new()
      const num_tokens = (await instance.numTokens.call()).toNumber()
      await instance.openAccount(1, { from: user_1 })
      await truffleAssert.reverts(
        instance.deposit(num_tokens + 1, 1, { from: user_1 }), 
        "Requested token is not registered"
      )
    })

    it("Reject: failed transfer (insufficeint funds)", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await truffleAssert.reverts(instance.deposit(token_index, 1, { from: user_1 }))
    })

    it("No deposit 0", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await truffleAssert.reverts(
        instance.deposit(token_index, 0, { from: user_1 }), 
        "Must deposit positive amount"
      )
    })

    it("Generic deposit", async () => {
      const instance = await SnappBase.new()
      const token = await MintableERC20.new()

      // fund accounts and approve contract for transfers
      await fundAccounts(owner, [user_1], token, 100)
      await approveContract(instance, [user_1], token, 100)

      await instance.addToken(token.address)
      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await instance.openAccount(token_index, { from: user_1 })

      // user 1 deposits 10
      const tx = await instance.deposit(token_index, 10, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      assert.notEqual((await instance.deposits(slot)).shaHash, 0)
    })

    it("Deposits over consecutive slots", async () => {
      const instance = await SnappBase.new()
      const token = await MintableERC20.new()
      
      // fund accounts and approve contract for transfers
      await fundAccounts(owner, [user_1], token, 100)
      await approveContract(instance, [user_1], token, 100)

      await instance.addToken(token.address)
      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await instance.openAccount(token_index, { from: user_1 })

      await waitForNBlocks(21, owner)
      // First deposit slot is missed (i.e. empty)
      assert.equal((await instance.deposits(0)).shaHash, 0)

      // user 1 deposits 10
      await instance.deposit(token_index, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()
      const deposit_state = await instance.deposits(slot)

      assert.notEqual(deposit_state.shaHash, 0)
      assert.equal(deposit_state.appliedAccountStateIndex, 0)
      assert.equal(deposit_state.size, 1)

      // wait for another 20 blocks and deposit again
      await waitForNBlocks(21, owner)
      await instance.deposit(token_index, 10, { from: user_1 })
      const next_slot = (await instance.depositIndex.call()).toNumber()

      assert.equal(next_slot, slot + 1)
      assert.notEqual((await instance.deposits(next_slot)).shaHash, 0)
    })
  })

  describe("applyDeposits()", () => {
    it("Only owner", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      
      await instance.deposit(1, 1, { from: user_1 })

      const slot = (await instance.depositIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await truffleAssert.reverts(
        instance.applyDeposits(slot, state_root, oneHash, deposit_state.shaHash, { from: user_1 })
      )
    })

    it("Reject: active slot", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      
      await instance.deposit(1, 1, { from: user_1 })
      
      const slot = (await instance.depositIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await truffleAssert.reverts(
        instance.applyDeposits(slot, state_root, oneHash, deposit_state.shaHash),
        "Requested deposit slot is still active"
      )
    })

    it("Reject: future slot", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      
      await instance.deposit(1, 1, { from: user_1 })

      const slot = (await instance.depositIndex.call()).toNumber()
      const deposit_state = await instance.deposits.call(slot)
      await truffleAssert.reverts(
        instance.applyDeposits(slot + 1, "0x0", "0x0", deposit_state.shaHash), 
        "Requested deposit slot does not exist"
      )
    })

    it("Reject: wrong state root", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(0, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(slot)

      await truffleAssert.reverts(
        instance.applyDeposits(slot, oneHash, zeroHash, deposit_state.shaHash),
        "Incorrect State Root"
      )
    })

    it("Reject: wrong deposit hash", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(0, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)
      await truffleAssert.reverts(
        instance.applyDeposits(slot, oneHash, zeroHash, "0x2"),
        "Deposits have been reorged"
      )
    })

    it("Successful apply deposit", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1, user_2], 2)

      // user 1 and 2 both deposit 10 of token 0 and 1
      await instance.deposit(0, 10, { from: user_1 })
      await instance.deposit(1, 10, { from: user_1 })
      await instance.deposit(0, 10, { from: user_2 })
      await instance.deposit(1, 10, { from: user_2 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)

      const state_index = (await instance.stateIndex.call()).toNumber()
      assert.equal((await instance.deposits.call(slot)).appliedAccountStateIndex, state_index)

      assert.equal(await instance.hasDepositBeenApplied.call(slot), true)
    })

    it("No apply same slot twice", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(0, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
      
      // Fail to apply same deposit twice
      await truffleAssert.reverts(
        instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash),
        "Deposits already processed"
      )
    })

    it("Must apply slots sequentially", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(0, 10, { from: user_1 })
      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)

      await instance.deposit(0, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      await waitForNBlocks(21, owner)
      
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      let deposit_state = await instance.deposits.call(slot)

      // Fail to apply deposit without previous
      await truffleAssert.reverts(
        instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash),
        "Must apply deposit slots in order!"
      )

      deposit_state = await instance.deposits.call(slot - 1)
      await instance.applyDeposits(slot - 1, state_root, zeroHash, deposit_state.shaHash)
      deposit_state = await instance.deposits.call(slot)
      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
    })

    it("No race condition: New deposits not prevented by applyDeposits", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(0, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(21, owner)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
      
      await instance.deposit(0, 10, { from: user_1 })
    })

    it("Cannot apply before first deposit", async () => {
      const instance = await SnappBase.new()

      const slot = (await instance.depositIndex.call())
      await truffleAssert.reverts(
        instance.applyDeposits(slot, "0x0", "0x0", "0x0"), 
        "Requested deposit slot does not exist"
      )
    })
  })

  describe("requestWithdrawal()", () => {
    it("Reject: unregistered accounts", async () => {
      const instance = await SnappBase.new()

      // Register 1 token
      const token = await ERC20.new()
      await instance.addToken(token.address)

      await truffleAssert.reverts(
        instance.requestWithdrawal(0, 1, { from: user_1 }),
        "Must have registered account"
      )
    })

    it("Reject: withdraw amount 0", async () => {
      const instance = await SnappBase.new()

      // Register 1 token
      const token = await ERC20.new()
      await instance.addToken(token.address)

      await instance.openAccount(1, { from: user_1 })
      await truffleAssert.reverts(
        instance.requestWithdrawal(0, 0, { from: user_1 }),
        "Must request positive amount"
      )
    })

    it("Reject: unregistered token", async () => {
      const instance = await SnappBase.new()
      const num_tokens = (await instance.numTokens.call()).toNumber()
      await instance.openAccount(1, { from: user_1 })
      await truffleAssert.reverts(
        instance.requestWithdrawal(num_tokens + 1, 1, { from: user_1 }),
        "Requested token is not registered"
      )
    })

    it("Reject: request amount > contract's token balance", async () => {
      const instance = await SnappBase.new()

      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      await truffleAssert.reverts(
        instance.requestWithdrawal(0, 1, { from: user_1 }),
        "Requested amount exceeds contract's balance"
      )
    })

    it("Generic withdraw", async () => {
      const instance = await SnappBase.new()

      // Register 1 token
      const token = await MintableERC20.new()
      await instance.addToken(token.address)
      const token_id = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()

      // Open 1 account
      const account_id = 1
      await instance.openAccount(account_id, { from: user_1 })

      const withdraw_amount = 1
      // Must enusure contract has sufficient balance for withdraw
      await fundAccounts(owner, [user_1], token, withdraw_amount)
      await approveContract(instance, [user_1], token, withdraw_amount)
      await instance.deposit(token_id, withdraw_amount, { from: user_1 })

      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })

      assert.equal(tx.logs[0].args.accountId.toNumber(), account_id, "Account ID doesn't match event")
      assert.equal(tx.logs[0].args.tokenId.toNumber(), token_id, "Token ID doesn't match event")
      assert.equal(tx.logs[0].args.amount.toNumber(), withdraw_amount, "Amount doesn't match event")

      // This was the first withdraw
      assert.equal(tx.logs[0].args.slotIndex.toNumber(), 0, "Expected slotIndex doesn't match event")

      const slot =  tx.logs[0].args.slot.toNumber()

      assert.notEqual(
        (await instance.pendingWithdraws(slot)).shaHash, 0, "pendingWithdraw hash expected to be non-zero")
    })

    it("Withdraw over consecutive slots", async () => {
      const instance = await SnappBase.new()

      const num_tokens = 2
      const num_accounts = 3
      await setupEnvironment(
        MintableERC20, instance, token_owner, accounts.slice(0, num_accounts), num_tokens)
            
      // Notice that contract can only check against its own balance of any given token
      // (i.e. the sum total of requested withdraws could exceed the balance)
      await instance.deposit(0, 1, { from: user_1 })
      
      const txs = await Promise.all(
        Array(100).fill().map(() => instance.requestWithdrawal(0, 1, { from: user_1 }))
      )
      
      const request_slots = txs.map(tx => tx.logs[0].args.slot.toNumber())
      const slot_frequency = request_slots.reduce(countDuplicates, {})
      
      const slots = []
      for(const k in slot_frequency) {
        slots.push(parseInt(k))
        // each slot respects the block time limit for expiry
        assert.equal(slot_frequency[k] <= 21, true)
      }

      slots.sort()
      for (let i = 0; i < slots.length - 1; i++) {
        assert.equal(slots[i] + 1, slots[i+1], "Slot index not consecutive")
      }
    })

  })

  describe("applyWithdrawals()", () => {
    it("Only owner", async () => {
      const instance = await SnappBase.new()

      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      await instance.deposit(1, 1, { from: user_1 })
      await instance.requestWithdrawal(1, 1, { from: user_1 })

      const slot = (await instance.withdrawIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const withdraw_state = await instance.pendingWithdraws.call(slot)

      const new_state = oneHash
      const merkle_root = zeroHash

      await truffleAssert.reverts(
        instance.applyWithdrawals(slot, merkle_root, state_root, new_state, withdraw_state.shaHash, { from: user_1 })
      )
    })

    it("Reject: active slot", async () => {
      const instance = await SnappBase.new()

      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      await instance.deposit(1, 1, { from: user_1 })
      await instance.requestWithdrawal(1, 1, { from: user_1 })

      const state_root = await stateHash(instance)

      const slot = (await instance.withdrawIndex.call()).toNumber()
      const withdraw_state = await instance.pendingWithdraws.call(slot)
      const new_state = oneHash
      const merkle_root = zeroHash

      assert.equal(await isActive(withdraw_state), true)

      await truffleAssert.reverts(
        instance.applyWithdrawals(slot, merkle_root, state_root, new_state, withdraw_state.shaHash),
        "Requested withdraw slot is still active"
      )
    })

    it("Reject: wrong state root", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const deposit_amount = 1
      const withdraw_amount = 1

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      assert.equal(slot, 0)  // Note that slot should be 0

      const withdraw_state = await instance.pendingWithdraws(slot)

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const wrong_state_root = oneHash
      assert.notEqual(wrong_state_root, await stateHash(instance))

      await truffleAssert.reverts(
        instance.applyWithdrawals(0, "0x0", wrong_state_root, "0x1", withdraw_state.shaHash),
        "Incorrect State Root"
      )
    })

    it("Reject: incorrect withdraw hash", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const deposit_amount = 1
      const withdraw_amount = 1

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const merkle_root = zeroHash

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const state_root = await stateHash(instance)
      const wrong_withdraw_hash = oneHash

      assert.notEqual(wrong_withdraw_hash, withdraw_state.shaHash)

      await truffleAssert.reverts(
        instance.applyWithdrawals(slot, merkle_root, state_root, new_state, wrong_withdraw_hash),
        "Withdraws have been reorged"
      )
    })

    it("Reject: out-of-range slot", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const deposit_amount = 10
      const withdraw_amount = 1

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const merkle_root = zeroHash

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const state_root = await stateHash(instance)

      const curr_slot = (await instance.depositIndex.call()).toNumber()
      await truffleAssert.reverts(
        instance.applyWithdrawals(curr_slot + 1, merkle_root, state_root, new_state, withdraw_state.shaHash),
        "Requested withdrawal slot does not exist"
      )
    })

    it("Successful apply withdraws", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const deposit_amount = 10
      const withdraw_amount = 1

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const merkle_root = zeroHash

      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await instance.applyWithdrawals(
        slot, merkle_root, state_root, new_state, withdraw_state.shaHash)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const applied_index = ((await instance.pendingWithdraws(slot)).appliedAccountStateIndex).toNumber()

      assert.equal(applied_index, state_index)
    })

    it("Reject: apply slots twice", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const deposit_amount = 10
      const withdraw_amount = 1

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const merkle_root = zeroHash

      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await instance.applyWithdrawals(
        slot, merkle_root, state_root, new_state, withdraw_state.shaHash)
      
      await truffleAssert.reverts(
        instance.applyWithdrawals(slot, merkle_root, state_root, new_state, withdraw_state.shaHash),
        "Withdraws already processed"
      )
    })

    it("Must apply slots sequentially", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      const token_id = 0
      const deposit_amount = 10
      const withdraw_amount = 2

      await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const first_tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const first_slot = first_tx.logs[0].args.slot.toNumber()
      const first_withdraw_state = await instance.pendingWithdraws(first_slot)
      const new_state = oneHash
      const merkle_root = zeroHash
      await waitForNBlocks(21, owner)

      const second_tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const second_slot = second_tx.logs[0].args.slot.toNumber()
      const second_withdraw_state = await instance.pendingWithdraws(second_slot)
      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await truffleAssert.reverts(
        instance.applyWithdrawals(second_slot, merkle_root, state_root, new_state, second_withdraw_state.shaHash),
        "Previous withdraw slot not processed!"
      )

      await instance.applyWithdrawals(
        first_slot, merkle_root, state_root, new_state, first_withdraw_state.shaHash)

      const new_new_state = "0x2"
      await instance.applyWithdrawals(
        second_slot, merkle_root, new_state, new_new_state, second_withdraw_state.shaHash)
    })

    it("Cannot apply before first withdrawal request", async () => {
      const instance = await SnappBase.new()

      const curr_slot = await instance.withdrawIndex.call()
      await truffleAssert.reverts(
        instance.applyWithdrawals(curr_slot, "0x0", "0x0", "0x0", "0x0"),
        "Requested withdrawal slot does not exist"
      )
    })
  })

  describe("claimWithdrawal()", () => {

    it("No apply unprocessed slots", async () => {
      const instance = await SnappBase.new()

      await instance.openAccount(1)
      const token = await ERC20.new()
      await instance.addToken(token.address)

      const tree = generateMerkleTree(0, zeroHash)
      const proof = Buffer.concat(tree.getProof(zeroHash).map(x => x.data))

      await truffleAssert.reverts(
        instance.claimWithdrawal(0, 0, 1, 1, 1, proof),
        "Requested slot has not been processed"
      )
    })

    it("Generic claim", async () => {
      const instance = await SnappBase.new()

      const tokens = await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const account_id = 0
      const deposit_amount = 10
      const withdraw_amount = 1

      // Deposit, wait and apply deposits
      const deposit_tx = await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const deposit_slot = (deposit_tx.logs[0].args.slot).toNumber()
      
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(deposit_slot)
      await instance.applyDeposits(
        deposit_slot, await stateHash(instance), "0x1", deposit_state.shaHash)

      // Request withdraw, wait and apply withdraw
      const withdraw_tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const withdraw_slot = withdraw_tx.logs[0].args.slot.toNumber()
      const withdraw_slot_index = withdraw_tx.logs[0].args.slotIndex.toNumber()

      await waitForNBlocks(21, owner)
      const withdraw_state = await instance.pendingWithdraws(withdraw_slot)

      // Need to apply at slot 0 (empty transition)
      await instance.applyWithdrawals(0, "0x0", await stateHash(instance), "0x1", "0x0")

      const leaf = encodePacked_16_8_128(account_id, token_id, withdraw_amount)
      const tree = generateMerkleTree(0, leaf)
      const merkle_root = tree.getRoot()
      const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

      await instance.applyWithdrawals(
        withdraw_slot, merkle_root, await stateHash(instance), "0x2", withdraw_state.shaHash)
      
      const prev_balance = (await tokens[0].balanceOf.call(user_1))
      await instance.claimWithdrawal(
        withdraw_slot, withdraw_slot_index, account_id, token_id, withdraw_amount, proof, { from: user_1 })
      const after_balance = (await tokens[0].balanceOf.call(user_1))
      assert.equal(after_balance.sub(prev_balance).toNumber(), 1)
    })

    it("Reject: Double claim", async () => {
      const instance = await SnappBase.new()

      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const account_id = 0
      const deposit_amount = 10
      const withdraw_amount = 2

      // Deposit, wait and apply deposits
      const deposit_tx = await instance.deposit(account_id, deposit_amount, { from: user_1 })
      const deposit_slot = (deposit_tx.logs[0].args.slot).toNumber()
      
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(deposit_slot)
      await instance.applyDeposits(
        deposit_slot, await stateHash(instance), "0x1", deposit_state.shaHash)

      // Request withdraw, wait and apply withdraw
      const withdraw_tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const withdraw_slot = withdraw_tx.logs[0].args.slot.toNumber()
      const withdraw_slot_index = withdraw_tx.logs[0].args.slotIndex.toNumber()

      await waitForNBlocks(21, owner)
      const withdraw_state = await instance.pendingWithdraws(withdraw_slot)

      // Need to apply at slot 0 (empty transition)
      await instance.applyWithdrawals(0, "0x0", await stateHash(instance), "0x1", "0x0")

      const leaf = encodePacked_16_8_128(account_id, token_id, withdraw_amount)
      const tree = generateMerkleTree(0, leaf)
      const merkle_root = tree.getRoot()
      const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

      await instance.applyWithdrawals(
        withdraw_slot, merkle_root, await stateHash(instance), "0x2", withdraw_state.shaHash)
      
      await instance.claimWithdrawal(
        withdraw_slot, withdraw_slot_index, account_id, token_id, withdraw_amount, proof, { from: user_1 })

      await truffleAssert.reverts(
        instance.claimWithdrawal(
          withdraw_slot, withdraw_slot_index, account_id, token_id, withdraw_amount, proof, { from: user_1 }),
        "Already claimed"
      )
    })

    it("Reject: Failed Merkle Verification", async () => {
      const instance = await SnappBase.new()

      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)
      const token_id = 0
      const account_id = 0
      const deposit_amount = 10
      const withdraw_amount = 2

      // Deposit, wait and apply deposits
      const deposit_tx = await instance.deposit(token_id, deposit_amount, { from: user_1 })
      const deposit_slot = (deposit_tx.logs[0].args.slot).toNumber()
      
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(deposit_slot)
      await instance.applyDeposits(
        deposit_slot, await stateHash(instance), "0x1", deposit_state.shaHash)

      // Request withdraw, wait and apply withdraw
      const withdraw_tx = await instance.requestWithdrawal(token_id, withdraw_amount, { from: user_1 })
      const withdraw_slot = withdraw_tx.logs[0].args.slot.toNumber()
      const withdraw_slot_index = withdraw_tx.logs[0].args.slotIndex.toNumber()

      await waitForNBlocks(21, owner)
      const withdraw_state = await instance.pendingWithdraws(withdraw_slot)

      // Need to apply at slot 0 (empty transition)
      await instance.applyWithdrawals(0, "0x0", await stateHash(instance), "0x1", "0x0")

      const leaf = encodePacked_16_8_128(account_id, token_id, withdraw_amount)
      const tree = generateMerkleTree(0, leaf)
      const merkle_root = tree.getRoot()
      const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

      await instance.applyWithdrawals(
        withdraw_slot, merkle_root, await stateHash(instance), "0x2", withdraw_state.shaHash)
      
      await truffleAssert.reverts(
        instance.claimWithdrawal(
          withdraw_slot, withdraw_slot_index + 1, account_id, token_id, withdraw_amount, proof, { from: user_1 }),
        "Failed Merkle membership check."
      )
    })
  })
})