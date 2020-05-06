const EpochTokenLocker = artifacts.require("EpochTokenLocker")
const EpochTokenLockerTestInterface = artifacts.require("EpochTokenLockerTestInterface")
const MockContract = artifacts.require("MockContract")
const ERC20Interface = artifacts.require("ERC20")

import truffleAssert from "truffle-assertions"
import { closeAuction } from "./utilities"

contract("EpochTokenLocker", async (accounts) => {
  const [user_1, user_2] = accounts

  describe("deposit()", () => {
    it("processes a deposit and stores it in the pendingDeposits", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId()

      await epochTokenLocker.deposit(ERC20.address, 100)
      const pendingDeposit = await epochTokenLocker.getPendingDeposit(user_1, ERC20.address)
      assert.equal(pendingDeposit[0].toNumber(), 100)
      assert(pendingDeposit[1].eq(currentStateIndex))
    })

    it("throws, if transferFrom fails", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyRevert()
      await truffleAssert.reverts(epochTokenLocker.deposit(ERC20.address, 100), "SafeERC20: low-level call failed")
    })

    it("adds two deposits, if they are deposited during same batchId", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.deposit(ERC20.address, 100)

      assert.equal((await epochTokenLocker.getPendingDeposit(user_1, ERC20.address))[0].toNumber(), 200)
    })

    it("does not consolidate two deposits, if they are not deposited during same batchId", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.deposit(ERC20.address, 200)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId()

      const pendingDeposit = await epochTokenLocker.getPendingDeposit(user_1, ERC20.address)
      assert.equal(pendingDeposit[0].toNumber(), 200)
      assert(pendingDeposit[1].eq(currentStateIndex))
    })
  })
  describe("requestWithdraw()", () => {
    it("processes a withdraw request", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId()

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      const pendingWithdraw = await epochTokenLocker.getPendingWithdraw(user_1, ERC20.address)
      assert.equal(pendingWithdraw[0].toNumber(), 100)
      assert(pendingWithdraw[1].eq(currentStateIndex))
    })
    it("processes a withdraw request, if previous withdraw request is valid", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      // checking that the transfer in withdraw wased
      const token = await ERC20Interface.new()
      const withdrawTransfer = token.contract.methods.transfer(accounts[0], 0).encodeABI()
      assert.equal((await ERC20.invocationCountForCalldata.call(withdrawTransfer)).toNumber(), 1)
    })
  })
  describe("requestFutureWithdraw()", () => {
    it("rejects futureWithdraw request from the past", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = (await epochTokenLocker.getCurrentBatchId()).toNumber()

      await truffleAssert.reverts(
        epochTokenLocker.requestFutureWithdraw(ERC20.address, 100, currentStateIndex - 1),
        "Request cannot be made in the past"
      )
    })
    it("processes a future withdraw request", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = (await epochTokenLocker.getCurrentBatchId()).toNumber()

      await epochTokenLocker.requestFutureWithdraw(ERC20.address, 100, currentStateIndex + 1)
      const pendingWithdraw = await epochTokenLocker.getPendingWithdraw(user_1, ERC20.address)
      assert.equal(pendingWithdraw[0].toNumber(), 100)
      assert.equal(pendingWithdraw[1].toNumber(), currentStateIndex + 1)
    })
  })
  describe("withdraw()", () => {
    it("processes a deposit, then processes a withdraw request and withdraws in next batchId", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.withdraw(user_1, ERC20.address)

      const pendingWithdraw = await epochTokenLocker.getPendingWithdraw(user_1, ERC20.address)
      assert.equal(pendingWithdraw[0].toNumber(), 0)
      assert.equal(pendingWithdraw[1].toNumber(), 0)

      const token = await ERC20Interface.new()
      const depositTransfer = token.contract.methods.transfer(accounts[0], 100).encodeABI()
      assert.equal((await ERC20.invocationCountForCalldata.call(depositTransfer)).toNumber(), 1)
    })
    it("processes a deposit, then processes a withdraw request and withdraws fails in current batchId", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await truffleAssert.reverts(epochTokenLocker.withdraw(user_1, ERC20.address), "withdraw was not registered previously")
    })
    it("processes a withdraw request and withdraws only available amounts", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 50)
      await closeAuction(epochTokenLocker)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.withdraw(user_1, ERC20.address)

      const token = await ERC20Interface.new()
      const depositTransfer = token.contract.methods.transfer(accounts[0], 50).encodeABI()
      assert.equal((await ERC20.invocationCountForCalldata.call(depositTransfer)).toNumber(), 1)
    })
    it("throws, if the withdraw wased, also there has been a credit for the account in this batch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100, {
        from: user_1,
      })
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.addBalanceAndBlockWithdrawForThisBatchTest(user_1, ERC20.address, 100)

      const batchId = await epochTokenLocker.getCurrentBatchId()
      assert.equal((await epochTokenLocker.lastCreditBatchId(user_1, ERC20.address)).toNumber(), batchId.toNumber())
      await truffleAssert.reverts(
        epochTokenLocker.withdraw(user_1, ERC20.address),
        "Withdraw not possible for token that is traded in the current auction"
      )
    })
  })
  describe("getBalance()", () => {
    it("returns just the balance, if there are no pending deposits and withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)
    })
    it("returns just the balance, if there are no pending deposit from a previous time and no withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 0)
    })
    it("returns just the balance + pending deposit, if there are no withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)
    })
    it("returns just the balance + pending deposit - depending withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.requestWithdraw(ERC20.address, 50)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 50)
    })
    it("returns just the balance + pending deposit - depending withdraws and protects overflows", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.requestWithdraw(ERC20.address, 150)
      await closeAuction(epochTokenLocker)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 0)
    })
    it("returns just the balance + pending deposit if withdraw was made in same batchId", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.requestWithdraw(ERC20.address, 150)
      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)
    })
  })
  describe("addBalance()", () => {
    it("modifies the balance by adding", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await epochTokenLocker.addBalanceTest(user_1, ERC20.address, 100)

      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 100)
    })
  })
  describe("addBalanceAndBlockWithdrawForThisBatch()", () => {
    it("does not postpone a withdrawRequest for a future epoch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId()
      await epochTokenLocker.requestWithdraw(ERC20.address, 100, {
        from: user_1,
      })
      await epochTokenLocker.addBalanceAndBlockWithdrawForThisBatchTest(user_1, ERC20.address, 100)

      assert.equal(
        (await epochTokenLocker.getPendingWithdraw(user_1, ERC20.address))[1].toNumber(),
        currentStateIndex.toNumber(),
        "State index updated incorrectly during to addBalanceAndBlockWithdrawForThisBatchTest"
      )
    })
    it("blocks withdraws for this epoch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      const currentStateIndex = await epochTokenLocker.getCurrentBatchId()
      await epochTokenLocker.requestWithdraw(ERC20.address, 100, {
        from: user_1,
      })
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.addBalanceAndBlockWithdrawForThisBatchTest(user_1, ERC20.address, 100)

      const batchId = await epochTokenLocker.getCurrentBatchId()
      assert.equal((await epochTokenLocker.lastCreditBatchId(user_1, ERC20.address)).toNumber(), batchId.toNumber())

      assert.equal(
        (await epochTokenLocker.getPendingWithdraw(user_1, ERC20.address))[1].toNumber(),
        currentStateIndex.toNumber(),
        "PendingWithdrawBatchNumber not set correctly"
      )
    })
  })
  describe("subtractBalance()", () => {
    it("modifies the balance by subtraction", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await epochTokenLocker.addBalanceTest(user_1, ERC20.address, 100)
      await epochTokenLocker.subtractBalanceTest(user_1, ERC20.address, 50)

      assert.equal((await epochTokenLocker.getBalance(user_1, ERC20.address)).toNumber(), 50)
    })
    it("modifies the balance by subtracting on behalf of someone else", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100, { from: user_2 })
      await closeAuction(epochTokenLocker)
      await epochTokenLocker.subtractBalanceTest(user_2, ERC20.address, 50)

      assert.equal((await epochTokenLocker.getBalance(user_2, ERC20.address)).toNumber(), 50)
    })
    it("throws in case of underflow", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await truffleAssert.reverts(epochTokenLocker.subtractBalanceTest(user_1, ERC20.address, 50))
    })
  })
})
