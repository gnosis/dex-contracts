const EpochTokenLocker = artifacts.require("EpochTokenLocker")
const EpochTokenLockerTestInterface = artifacts.require("EpochTokenLockerTestInterface")
const MockContract = artifacts.require("MockContract")
const ERC20Interface = artifacts.require("ERC20")

const truffleAssert = require("truffle-assertions")
const { waitForNSeconds } = require("./utilities.js")


contract("EpochTokenLocker", async (accounts) => {
  const [user_1, user_2] = accounts

  let BATCH_TIME
  before(async () => {
    const instance = await EpochTokenLocker.new()
    BATCH_TIME = (await instance.BATCH_TIME.call()).toNumber()
  })

  describe("deposit", () => {
    it("processes a deposit and stores it in the pendingDeposits", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId.call()

      await epochTokenLocker.deposit(ERC20.address, 100)
      assert.equal(await epochTokenLocker.getPendingDepositAmount(user_1, ERC20.address), 100)
      assert.equal((await epochTokenLocker.getPendingDepositBatchNumber.call(user_1, ERC20.address)).toNumber(), currentStateIndex.toNumber())

    })

    it("throws, if transferFrom fails", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(false)
      await truffleAssert.reverts(epochTokenLocker.deposit(ERC20.address, 100), "Tokentransfer for deposit was not successful")
    })

    it("adds two deposits, if they are deposited during same stateIndex", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.deposit(ERC20.address, 100)

      assert.equal(await epochTokenLocker.getPendingDepositAmount(user_1, ERC20.address), 200)
    })

    it("does not consolidates two deposits, if they are not deposited during same stateIndex", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.deposit(ERC20.address, 200)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId.call()


      assert.equal(await epochTokenLocker.getPendingDepositAmount(user_1, ERC20.address), 200)
      assert.equal((await epochTokenLocker.getPendingDepositBatchNumber(user_1, ERC20.address)).toNumber(), currentStateIndex.toNumber())
    })
  })
  describe("requestWithdraw", () => {
    it("processes a withdraw request", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId.call()

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      assert.equal(await epochTokenLocker.getPendingWithdrawAmount(user_1, ERC20.address), 100)
      assert.equal((await epochTokenLocker.getPendingWithdrawBatchNumber(user_1, ERC20.address)).toNumber(), currentStateIndex.toNumber())
    })
    it("processes a withdraw request, if previous withdraw request is valid", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      // checking that the transfer in withdraw was called
      const token = await ERC20Interface.new()
      const withdrawTransfer = token.contract.methods.transfer(accounts[0], 0).encodeABI()
      assert.equal(await ERC20.invocationCountForCalldata.call(withdrawTransfer), 1)
    })
  })
  describe("withdraw", () => {
    it("processes a deposit, then processes a withdraw request and withdraws in next stateIndex", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      assert.equal(await epochTokenLocker.getBalance.call(user_1, ERC20.address), 100)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.withdraw(ERC20.address)

      assert.equal(await epochTokenLocker.getPendingWithdrawAmount(user_1, ERC20.address), 0)
      assert.equal(await epochTokenLocker.getPendingWithdrawBatchNumber(user_1, ERC20.address), 0)

      const token = await ERC20Interface.new()
      const depositTransfer = token.contract.methods.transfer(accounts[0], 100).encodeABI()
      assert.equal(await ERC20.invocationCountForCalldata.call(depositTransfer), 1)
    })
    it("processes a deposit, then processes a withdraw request and withdraws fails in current stateIndex", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      assert.equal(await epochTokenLocker.getBalance(user_1, ERC20.address), 100)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await truffleAssert.reverts(epochTokenLocker.withdraw(ERC20.address), "withdraw was not registered previously")
    })
    it("processes a withdraw request and withdraws only available amounts", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)


      await epochTokenLocker.deposit(ERC20.address, 50)
      await waitForNSeconds(BATCH_TIME)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.withdraw(ERC20.address)

      const token = await ERC20Interface.new()
      const depositTransfer = token.contract.methods.transfer(accounts[0], 50).encodeABI()
      assert.equal(await ERC20.invocationCountForCalldata.call(depositTransfer), 1)
    })
    it("throws, if the withdraw was called, also there has been a credit for the account in this batch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.requestWithdraw(ERC20.address, 100, { from: user_1 })
      await waitForNSeconds(BATCH_TIME + 1)
      await epochTokenLocker.addBalanceAndProcessDueWithdrawTest(user_1, ERC20.address, 100)

      const batchId = await epochTokenLocker.getCurrentBatchId.call()
      assert.equal(await epochTokenLocker.hasCreditedBalance.call(user_1, ERC20.address, batchId), true)
      await truffleAssert.reverts(
        epochTokenLocker.withdraw(ERC20.address),
        "withdraw is not possible, due to new credit in this batchId"
      )
    })
  })
  describe("getBalance", () => {
    it("returns just the balance, if there are no pending deposits and withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      assert.equal((await epochTokenLocker.getBalance.call(user_1, ERC20.address)).toNumber(), 100)
    })
    it("returns just the balance, if there are no pending deposit from a previous time and no withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      assert.equal((await epochTokenLocker.getBalance.call(user_1, ERC20.address)).toNumber(), 0)
    })
    it("returns just the balance + pending deposit, if there are no withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      assert.equal(await epochTokenLocker.getBalance.call(user_1, ERC20.address), 100)
    })
    it("returns just the balance + pending deposit - depending withdraws", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.requestWithdraw(ERC20.address, 50)
      await waitForNSeconds(BATCH_TIME)
      assert.equal(await epochTokenLocker.getBalance.call(user_1, ERC20.address), 50)
    })
    it("returns just the balance + pending deposit - depending withdraws and protects overflows", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await epochTokenLocker.requestWithdraw(ERC20.address, 150)
      await waitForNSeconds(BATCH_TIME)
      assert.equal(await epochTokenLocker.getBalance.call(user_1, ERC20.address), 0)
    })
    it("returns just the balance + pending deposit if withdraw was made in same stateIndex", async () => {
      const epochTokenLocker = await EpochTokenLocker.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100)
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.requestWithdraw(ERC20.address, 150)
      assert.equal(await epochTokenLocker.getBalance.call(user_1, ERC20.address), 100)
    })
  })
  describe("addBalance", () => {
    it("modifies the balance by adding", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await epochTokenLocker.addBalanceTest(user_1, ERC20.address, 100)

      assert.equal(await epochTokenLocker.getBalance(user_1, ERC20.address), 100)
    })
  })
  describe("addBalanceAndProcessDueWithdraw", () => {
    it("does not postpone a withdrawRequest for a future epoch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      const currentStateIndex = await epochTokenLocker.getCurrentBatchId.call()
      await epochTokenLocker.requestWithdraw(ERC20.address, 100, { from: user_1 })
      await epochTokenLocker.addBalanceAndProcessDueWithdrawTest(user_1, ERC20.address, 100)

      assert.equal((await epochTokenLocker.getPendingWithdrawBatchNumber(user_1, ERC20.address)).toNumber(), currentStateIndex, "State index updated incorrectly during call to addBalanceAndProcessDueWithdrawTest")
    })
    it("blocks withdraws for this epoch", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      const currentStateIndex = await epochTokenLocker.getCurrentBatchId.call()
      await epochTokenLocker.requestWithdraw(ERC20.address, 100, { from: user_1 })
      await waitForNSeconds(BATCH_TIME + 1)
      await epochTokenLocker.addBalanceAndProcessDueWithdrawTest(user_1, ERC20.address, 100)

      const batchId = await epochTokenLocker.getCurrentBatchId.call()
      assert.equal(await epochTokenLocker.hasCreditedBalance.call(user_1, ERC20.address, batchId), true)
      assert.equal((await epochTokenLocker.getPendingWithdrawBatchNumber(user_1, ERC20.address)).toNumber(), currentStateIndex.toString(), "PendingWithdrawBatchNumber not set correctly")
    })
  })
  describe("subtractBalance", () => {
    it("modifies the balance by subtraction", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await epochTokenLocker.addBalanceTest(user_1, ERC20.address, 100)
      await epochTokenLocker.subtractBalanceTest(user_1, ERC20.address, 50)

      assert.equal(await epochTokenLocker.getBalance(user_1, ERC20.address), 50)
    })
    it("modifies the balance by subtracting on behalf of someone else", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await epochTokenLocker.deposit(ERC20.address, 100, { from: user_2 })
      await waitForNSeconds(BATCH_TIME)
      await epochTokenLocker.subtractBalanceTest(user_2, ERC20.address, 50)

      assert.equal(await epochTokenLocker.getBalance(user_2, ERC20.address), 50)
    })
    it("throws in case of underflow", async () => {
      const epochTokenLocker = await EpochTokenLockerTestInterface.new()
      const ERC20 = await MockContract.new()

      await truffleAssert.reverts(epochTokenLocker.subtractBalanceTest(user_1, ERC20.address, 50))
    })
  })
})
