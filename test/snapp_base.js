const SnappBase = artifacts.require("SnappBase")
const ERC20 = artifacts.require("ERC20")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const zeroHash = "0x0"
const oneHash = "0x1"

const Promise = require("es6-promise").Promise

const {
  assertRejects,
  waitForNBlocks,
  fundAccounts,
  approveContract,
  countDuplicates,
  generateMerkleTree,
  // toHex,
  setupEnvironment } = require("./utilities.js")

const {
  falseArray,
  isActive,
  stateHash,
  encodePacked_16_8_128 }  = require("./snapp_utils.js")

const { sha256 } = require("ethereumjs-util")

contract("SnappBase", async (accounts) => {
  const [owner, token_owner, user_1, user_2] = accounts

  describe("public view functions", () => {
    it("getCurrentStateRoot()", async () => {
      const instance = await SnappBase.new()
      // TODO - substitute this with correct initStateHash
      const state_init = "0x0000000000000000000000000000000000000000000000000000000000000000"
      assert.equal(await instance.getCurrentStateRoot.call(), state_init)
    })

    it("hasDepositBeenApplied(slot) == false", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.hasDepositBeenApplied.call(0), false)
    })

    it("isDepositSlotEmpty(slot)", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.isDepositSlotEmpty.call(0), true)
    })

    it("getDepositCreationBlock(slot)", async () => {
      const instance = await SnappBase.new()
      const tx = await web3.eth.getTransaction(instance.transactionHash)

      assert.equal((await instance.getDepositCreationBlock.call(0)).toNumber(), tx.blockNumber)
    })

    it("getDepositHash(slot)", async () => {
      const instance = await SnappBase.new()
      assert.equal(await instance.getDepositHash.call(0), 0x0)
    })

  })
  
  describe("openAccount()", () => {
    it("Account index default is 0", async () => {
      const instance = await SnappBase.new()
      const account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
      assert.equal(account_index, 0)
    })

    it("Don't allow open account at 0", async () => {
      const instance = await SnappBase.new()
      await assertRejects(instance.openAccount(0))
    })

    it("Do not allow open account at index > maxAccountNumber", async () => {
      const instance = await SnappBase.new()
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await assertRejects(instance.openAccount(max_account_id + 1))
    })

    it("Do allow open account at index = maxAccountNumber", async () => {
      const instance = await SnappBase.new()
      const max_account_id = (await instance.MAX_ACCOUNT_ID.call()).toNumber()
      await instance.openAccount(max_account_id)
      assert.equal(max_account_id, (await instance.publicKeyToAccountMap.call(owner)).toNumber())
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

    it("Can't open two accounts at same index", async () => {
      const instance = await SnappBase.new()
      const account_index = 1
      await instance.openAccount(account_index)

      // Account owner can't open another
      await assertRejects(instance.openAccount(account_index))

      // Others can't open another
      await assertRejects(instance.openAccount(account_index, { from: user_1}))
    })

    it("Open multiple accounts", async () => {
      const instance = await SnappBase.new()
      
      for (let i = 0; i < accounts.length; i++) {
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

      assert.equal((await instance.tokenAddresToIdMap.call(token_1.address)).toNumber(), 1)
      assert.equal(await instance.tokenIdToAddressMap.call(1), token_1.address)

      const token_2 = await ERC20.new()
      await instance.addToken(token_2.address)

      assert.equal((await instance.tokenAddresToIdMap.call(token_2.address)).toNumber(), 2)
      assert.equal(await instance.tokenIdToAddressMap.call(2), token_2.address)
    })

    it("Nobody else can add tokens", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()

      await assertRejects(instance.addToken(token.address, {from: user_1}))
      await assertRejects(instance.addToken(token.address, {from: user_2}))
    })

    it("Can't add same token twice", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()

      await instance.addToken(token.address)
      await assertRejects(instance.addToken(token.address))
    })

    it("Can't exceed max tokens", async () => {
      const instance = await SnappBase.new()
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
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      
      await assertRejects(instance.deposit(token_index, 0))
    })

    it("No deposit with failed transfer (insufficeint funds)", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      
      await assertRejects(instance.deposit(token_index, 1, { from: user_1 }))
    })

    it("No deposit unregistered token", async () => {
      const instance = await SnappBase.new()
      const num_tokens = (await instance.numTokens.call()).toNumber()
      await instance.openAccount(1, { from: user_1 })
      await assertRejects(instance.deposit(num_tokens + 1, 1, { from: user_1 }))
    })

    it("No deposit 0", async () => {
      const instance = await SnappBase.new()
      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      const token_index = (await instance.tokenAddresToIdMap.call(token.address)).toNumber()
      await assertRejects(instance.deposit(token_index, 0, { from: user_1 }))
    })

    it("Generic Deposit", async () => {
      const instance = await SnappBase.new()
      const token = await MintableERC20.new()
      const token_index = 1

      // fund accounts and approve contract for transfers
      await fundAccounts(owner, accounts, token, 100)
      await approveContract(instance, accounts, token, 100)

      await instance.addToken(token.address)
      await instance.openAccount(token_index, { from: user_1 })

      // user 1 deposits 10
      const tx = await instance.deposit(token_index, 10, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      assert.notEqual((await instance.deposits(slot)).shaHash, 0)
    })

    it("Deposits over consecutive slots", async () => {
      const instance = await SnappBase.new()
      const token = await MintableERC20.new()
      const token_index = 1
      
      // fund accounts and approve contract for transfers
      await fundAccounts(owner, accounts.slice(0, 4), token, 100)
      await approveContract(instance, accounts.slice(0, 4), token, 100)

      await instance.addToken(token.address)
      await instance.openAccount(token_index, { from: user_1 })

      await waitForNBlocks(20, owner)
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
      await waitForNBlocks(20, owner)
      await instance.deposit(token_index, 10, { from: user_1 })
      const next_slot = (await instance.depositIndex.call()).toNumber()

      assert.equal(next_slot, slot + 1)
      assert.notEqual((await instance.deposits(next_slot)).shaHash, 0)
    })
  })

  describe("applyDeposits()", () => {
    it("Only owner can apply deposits", async () => {
      const instance = await SnappBase.new()

      const slot = (await instance.depositIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await assertRejects(instance.applyDeposits(slot, state_root, oneHash, deposit_state.shaHash, { from: user_1 }))
    })

    it("No apply deposit on active slot", async () => {
      const instance = await SnappBase.new()
      
      const slot = (await instance.depositIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await assertRejects(instance.applyDeposits(slot, state_root, oneHash, deposit_state.shaHash))
    })

    it("Can't apply with wrong stateRoot", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, accounts, 2)

      await instance.deposit(1, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)
      const deposit_state = await instance.deposits.call(slot)

      await assertRejects(
        instance.applyDeposits(slot, oneHash, zeroHash, deposit_state.shaHash))
    })

    it("Successful apply deposit", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1, user_2], 2)

      // user 1 and 2 both deposit 10 of token 1 and 2
      await instance.deposit(1, 10, { from: user_1 })
      await instance.deposit(2, 10, { from: user_1 })
      await instance.deposit(1, 10, { from: user_2 })
      await instance.deposit(2, 10, { from: user_2 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const state_root = await stateHash(instance)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)

      const state_index = (await instance.stateIndex.call()).toNumber()
      assert.equal((await instance.deposits.call(slot)).appliedAccountStateIndex, state_index)

      assert.equal(await instance.hasDepositBeenApplied.call(slot), true)
    })

    it("Can't apply deposits twice", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.deposit(1, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
      
      // Fail to apply same deposit twice
      await assertRejects(
        instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash))
    })

    it("Can't apply deposits non-ordered", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.deposit(1, 10, { from: user_1 })
      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      await instance.deposit(1, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      await waitForNBlocks(20, owner)
      
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      let deposit_state = await instance.deposits.call(slot)

      
      // Fail to apply deposit without previous
      await assertRejects(
        instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash))
      deposit_state = await instance.deposits.call(slot - 1)
      await instance.applyDeposits(slot - 1, state_root, zeroHash, deposit_state.shaHash)
      deposit_state = await instance.deposits.call(slot)
      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
    })
    it("There is no race condition: deposits are not stopped from applyDeposits", async () => {
      const instance = await SnappBase.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.deposit(1, 10, { from: user_1 })
      const slot = (await instance.depositIndex.call()).toNumber()

      // Wait for current depoit index to increment
      await waitForNBlocks(20, owner)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const deposit_state = await instance.deposits.call(slot)

      await instance.applyDeposits(slot, state_root, zeroHash, deposit_state.shaHash)
      
      await instance.deposit(1, 10, { from: user_1 })
    })
  })
  describe("requestWithdrawal()", () => {
    it("No unregistered token", async () => {
      const instance = await SnappBase.new()
      const num_tokens = (await instance.numTokens.call()).toNumber()
      await instance.openAccount(1, { from: user_1 })
      await assertRejects(instance.requestWithdrawal(num_tokens + 1, 1, { from: user_1 }))
    })

    it("Only registered accounts", async () => {
      const instance = await SnappBase.new()

      // Ensure user_1 doesn't have account
      assert.equal((await instance.publicKeyToAccountMap.call(user_1)).toNumber(), 0)

      // Register 1 token
      const token = await ERC20.new()
      await instance.addToken(token.address)

      await assertRejects(instance.requestWithdrawal(1, 1, { from: user_1 }))
    })

    it("No withdraw 0", async () => {
      const instance = await SnappBase.new()

      // Register 1 token
      const token = await ERC20.new()
      await instance.addToken(token.address)

      await instance.openAccount(1, { from: user_1 })
      await assertRejects(instance.requestWithdrawal(1, 0, { from: user_1 }))
    })

    it("No amount greater than contract's token balance", async () => {
      const instance = await SnappBase.new()

      const token = await ERC20.new()
      await instance.addToken(token.address)
      await instance.openAccount(1, { from: user_1 })

      await assertRejects(instance.requestWithdrawal(1, 1, { from: user_1 }))
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
      await instance.deposit(1, 1, { from: user_1 })
      
      const txs = await Promise.all(
        Array(100).fill().map(() => instance.requestWithdrawal(1, 1, { from: user_1 }))
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

      const slot = (await instance.withdrawIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const withdraw_state = await instance.pendingWithdraws.call(slot)

      const new_state = oneHash
      const bit_map = falseArray(100)
      const merkle_root = zeroHash

      await assertRejects(
        instance.applyWithdrawals(
          slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash, { from: user_1 }))
    })

    it("No apply on active slot", async () => {
      const instance = await SnappBase.new()
      
      const state_root = await stateHash(instance)

      const slot = (await instance.withdrawIndex.call()).toNumber()
      const withdraw_state = await instance.pendingWithdraws.call(slot)
      const new_state = oneHash
      const bit_map = falseArray(100)
      const merkle_root = zeroHash

      assert.equal(await isActive(withdraw_state), true)

      await assertRejects(
        instance.applyWithdrawals(
          slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash))
    })

    it("Can't apply with wrong state root", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, accounts, 2)

      await instance.deposit(1, 1, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const bit_map = falseArray(100, [])
      const merkle_root = zeroHash

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const wrong_state_root = oneHash

      assert.notEqual(wrong_state_root, await stateHash(instance))

      await assertRejects(
        instance.applyWithdrawals(
          slot, bit_map, merkle_root, wrong_state_root, new_state, withdraw_state.shaHash))
    })

    it("Can't apply with incorrect withdraw hash", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, accounts, 2)

      await instance.deposit(1, 1, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const bit_map = falseArray(100, [])
      const merkle_root = zeroHash

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const state_root = await stateHash(instance)
      const wrong_withdraw_hash = oneHash

      assert.notEqual(wrong_withdraw_hash, withdraw_state.shaHash)

      await assertRejects(
        instance.applyWithdrawals(
          slot, bit_map, merkle_root, state_root, new_state, wrong_withdraw_hash))
    })

    it("Can't apply with on out-of-range slot", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, accounts, 2)

      await instance.deposit(1, 1, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const bit_map = falseArray(100)
      const merkle_root = zeroHash

      // Wait for current withdraw slot to be inactive
      await waitForNBlocks(21, owner)

      // ensure withdraw state is inactive
      assert.equal(await isActive(withdraw_state), false)

      const state_root = await stateHash(instance)

      const too_large_slot = (await instance.depositIndex.call()).toNumber() + 1
      await assertRejects(
        instance.applyWithdrawals(
          too_large_slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash))

    })

    it("Successful apply withdraws", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(1, 10, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const bit_map = falseArray(100, [0])
      const merkle_root = zeroHash

      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await instance.applyWithdrawals(
        slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const applied_index = ((await instance.pendingWithdraws(slot)).appliedAccountStateIndex).toNumber()

      assert.equal(applied_index, state_index)
    })

    it("Can't apply withdraw slots twice", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(1, 10, { from: user_1 })
      const tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const slot = tx.logs[0].args.slot.toNumber()
      const withdraw_state = await instance.pendingWithdraws(slot)
      const new_state = oneHash
      const bit_map = falseArray(100, [0])
      const merkle_root = zeroHash

      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await instance.applyWithdrawals(
        slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash)
      
      await assertRejects(
        instance.applyWithdrawals(
          slot, bit_map, merkle_root, state_root, new_state, withdraw_state.shaHash)
      )
    })
    it("Must apply withdraw slots sequentially", async () => {
      const instance = await SnappBase.new()
      
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      await instance.deposit(1, 10, { from: user_1 })
      const first_tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const first_slot = first_tx.logs[0].args.slot.toNumber()
      const first_withdraw_state = await instance.pendingWithdraws(first_slot)
      const new_state = oneHash
      const bit_map = falseArray(100, [0])
      const merkle_root = zeroHash
      await waitForNBlocks(21, owner)

      const second_tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const second_slot = second_tx.logs[0].args.slot.toNumber()
      const second_withdraw_state = await instance.pendingWithdraws(second_slot)
      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)
      await assertRejects(instance.applyWithdrawals(
        second_slot, bit_map, merkle_root, state_root, new_state, second_withdraw_state.shaHash))

      await instance.applyWithdrawals(
        first_slot, bit_map, merkle_root, state_root, new_state, first_withdraw_state.shaHash)

      const new_new_state = "0x2"
      await instance.applyWithdrawals(
        second_slot, bit_map, merkle_root, new_state, new_new_state, second_withdraw_state.shaHash)
    })
  })

  describe("claimWithdrawal()", () => {

    it("Can't apply unprocessed slots", async () => {
      const instance = await SnappBase.new()

      await instance.openAccount(1)
      const token = await ERC20.new()
      await instance.addToken(token.address)

      const tree = generateMerkleTree(0, zeroHash)
      const proof = Buffer.concat(tree.getProof(zeroHash).map(x => x.data))

      await assertRejects(instance.claimWithdrawal(0, 0, 1, 1, 1, proof))
    })

    it("Can't get past false bitmap index", async () => {
      const instance = await SnappBase.new()

      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      // Deposit, wait and apply deposits
      const deposit_tx = await instance.deposit(1, 10, { from: user_1 })
      const deposit_slot = (deposit_tx.logs[0].args.slot).toNumber()
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(deposit_slot)
      await instance.applyDeposits(
        deposit_slot, await stateHash(instance), "0x1", deposit_state.shaHash)

      // Request withdraw, wait and apply withdraw
      const withdraw_tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const withdraw_slot = withdraw_tx.logs[0].args.slot.toNumber()
      const withdraw_slot_index = withdraw_tx.logs[0].args.slotIndex.toNumber()

      await waitForNBlocks(21, owner)
      const withdraw_state = await instance.pendingWithdraws(withdraw_slot)
      const bit_map = falseArray(100, [0])

      // Need to apply at slot 0
      await instance.applyWithdrawals(0, falseArray(100), "0x0", await stateHash(instance), "0x1", "0x0")

      const leaf = sha256(encodePacked_16_8_128(1, 1, 1))
      const tree = generateMerkleTree(0, leaf)
      const merkle_root = tree.getRoot()
      const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))
      
      await instance.applyWithdrawals(
        withdraw_slot, bit_map, merkle_root, await stateHash(instance), "0x2", withdraw_state.shaHash)
      
      // give wrong bitmap/inclusion index.
      await assertRejects(
        instance.claimWithdrawal(
          withdraw_slot, withdraw_slot_index + 1, 1, 1, 1, proof, { from: user_1 }))
    })

    it("Generic claim", async () => {
      const instance = await SnappBase.new()

      const tokens = await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 1)

      // Deposit, wait and apply deposits
      const deposit_tx = await instance.deposit(1, 10, { from: user_1 })
      const deposit_slot = (deposit_tx.logs[0].args.slot).toNumber()
      await waitForNBlocks(21, owner)
      const deposit_state = await instance.deposits.call(deposit_slot)
      await instance.applyDeposits(
        deposit_slot, await stateHash(instance), "0x1", deposit_state.shaHash)

      // Request withdraw, wait and apply withdraw
      const withdraw_tx = await instance.requestWithdrawal(1, 1, { from: user_1 })
      const withdraw_slot = withdraw_tx.logs[0].args.slot.toNumber()
      const withdraw_slot_index = withdraw_tx.logs[0].args.slotIndex.toNumber()

      await waitForNBlocks(21, owner)
      const withdraw_state = await instance.pendingWithdraws(withdraw_slot)
      const bit_map = falseArray(100, [0])

      // Need to apply at slot 0 (empty transition)
      await instance.applyWithdrawals(0, falseArray(100), "0x0", await stateHash(instance), "0x1", "0x0")

      const leaf = sha256(encodePacked_16_8_128(1, 1, 1))
      const tree = generateMerkleTree(0, leaf)
      const merkle_root = tree.getRoot()
      const proof = Buffer.concat(tree.getProof(leaf).map(x => x.data))

      await instance.applyWithdrawals(
        withdraw_slot, bit_map, merkle_root, await stateHash(instance), "0x2", withdraw_state.shaHash)
      
      const prev_balance = (await tokens[0].balanceOf.call(user_1)).toNumber()
      await instance.claimWithdrawal(
        withdraw_slot, withdraw_slot_index, 1, 1, 1, proof, { from: user_1 })
      const after_balance = (await tokens[0].balanceOf.call(user_1)).toNumber()
      
      assert.equal(prev_balance + 1, after_balance)
    })
  })
})