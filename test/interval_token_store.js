const IntervalTokenStore = artifacts.require("IntervalTokenStore")
const IntervalTokenStoreTestInterface = artifacts.require("IntervalTokenStoreTestInterface")
const MockContract = artifacts.require("MockContract")
const ERC20Interface = artifacts.require("ERC20")



const truffleAssert = require("truffle-assertions")


contract("IntervalTokenStore", async (accounts) => {
  const [user_1] = accounts

  describe("deposit", () => {
    it("processes a deposit and stores it in the pendingDeposits", async () => {
      const instance = await IntervalTokenStore.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await instance.deposit(ERC20.address, 100)
      assert.equal(await instance.getPendingDepositAmount(user_1, ERC20.address), 100)
      assert.equal(await instance.getPendingDepositBatchNumber(user_1, ERC20.address), 0)
    })
  
    it("throws, if transferFrom fails", async () => {
      const instance = await IntervalTokenStore.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(false)
      await truffleAssert.reverts(instance.deposit(ERC20.address, 100), "Tokentransfer for deposit was not successful")
    })

    it("adds two deposits, if they are deposited during same stateIndex", async () => {
      const instance = await IntervalTokenStore.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await instance.deposit(ERC20.address, 100)
      await instance.deposit(ERC20.address, 100)

      assert.equal(await instance.getPendingDepositAmount(user_1, ERC20.address), 200)
      assert.equal(await instance.getPendingDepositBatchNumber(user_1, ERC20.address), 0)
    })

    it("does not add two deposits, if they are not deposited during same stateIndex", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.deposit(ERC20.address, 100)
  
      assert.equal(await instance.getPendingDepositAmount(user_1, ERC20.address), 100)
      assert.equal(await instance.getPendingDepositBatchNumber(user_1, ERC20.address), 1)
    })
  })

  describe("updateDepositsBalance", () => {
    it("processes a deposit and will not process the pendingDeposit with same stateIndex", async () => {
      const instance = await IntervalTokenStore.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)

      await instance.deposit(ERC20.address, 100)
      await instance.updateDepositsBalance(user_1, ERC20.address)
      assert.equal(await instance.getPendingDepositAmount(user_1, ERC20.address), 100)
      assert.equal(await instance.getPendingDepositBatchNumber(user_1, ERC20.address), 0)
    })
  
    it("processes a deposit and will process the pendingDeposit with higher stateIndex", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
  
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.updateDepositsBalance(user_1, ERC20.address)
      assert.equal(await instance.getBalance(user_1, ERC20.address), 100)
      assert.equal(await instance.getPendingDepositAmount(user_1, ERC20.address), 0)
      assert.equal(await instance.getPendingDepositBatchNumber(user_1, ERC20.address), 0)
    })
  })
  describe("withdrawRequest", () => {  
    it("processes a withdraw request", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
  
      await instance.withdrawRequest(ERC20.address, 100)
      assert.equal(await instance.getPendingWithdrawAmount(user_1, ERC20.address), 100)
      assert.equal(await instance.getPendingWithdrawBatchNumber(user_1, ERC20.address), 0)
    })
  })
  describe("withdraws", () => {  
    it("processes a deposit, then processes a withdraw request and withdraws in next stateIndex", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
    
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.updateDepositsBalance(user_1, ERC20.address)
      assert.equal(await instance.getBalance(user_1, ERC20.address), 100)

      await instance.withdrawRequest(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.withdraw(ERC20.address, 100)

      assert.equal(await instance.getPendingWithdrawAmount(user_1, ERC20.address), 0)
      assert.equal(await instance.getPendingWithdrawBatchNumber(user_1, ERC20.address), 0)

      const token = await ERC20Interface.new()
      const depositTransfer = token.contract.methods.transfer(accounts[0], 100).encodeABI()
      assert.equal(await ERC20.invocationCountForCalldata.call(depositTransfer), 1)
    })
    it("processes a deposit, then processes a withdraw request and withdraws fails in current stateIndex", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.updateDepositsBalance(user_1, ERC20.address)
      assert.equal(await instance.getBalance(user_1, ERC20.address), 100)
  
      await instance.withdrawRequest(ERC20.address, 100)
      await truffleAssert.reverts(instance.withdraw(ERC20.address, 100), "withdraw was not registered previously")
    })
    it("processes a withdraw request and withdraws fails, as withdraw amount was not sufficient", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
    
      await instance.withdrawRequest(ERC20.address, 10)
      await instance.increaseStateIndex()
      await truffleAssert.reverts(instance.withdraw(ERC20.address, 100), "registered withdraw-amount was not sufficient")
    })
    it("processes a withdraw request and withdraws fails, as balance is not sufficient", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      
      await instance.withdrawRequest(ERC20.address, 100)
      await instance.increaseStateIndex()
      await truffleAssert.reverts(instance.withdraw(ERC20.address, 100), "balances not sufficient")
    })
  })
  describe("updateAndGetBalance", () => {  
    it("returns just the balance, if there are no pending deposits and withdraws", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
    
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      await instance.updateDepositsBalance(user_1, ERC20.address)

      assert.equal(await instance.getBalance(user_1, ERC20.address), 100)
      assert.equal(await instance.updateAndGetBalance.call(user_1, ERC20.address), 100)
    })
    it("returns just the balance + pending deposit, if there are no withdraws", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      
      await instance.deposit(ERC20.address, 100)
      await instance.increaseStateIndex()
      assert.equal(await instance.updateAndGetBalance.call(user_1, ERC20.address), 100)
    })
    it("returns just the balance + pending deposit - depending withdraws", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      
      await instance.deposit(ERC20.address, 100)
      await instance.withdrawRequest(ERC20.address, 50)
      await instance.increaseStateIndex()
      assert.equal(await instance.updateAndGetBalance.call(user_1, ERC20.address), 50)
    })
    it("returns just the balance + pending deposit - depending withdraws and protects overflows", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
      await ERC20.givenAnyReturnBool(true)
      
      await instance.deposit(ERC20.address, 100)
      await instance.withdrawRequest(ERC20.address, 150)
      await instance.increaseStateIndex()
      assert.equal(await instance.updateAndGetBalance.call(user_1, ERC20.address), 0)
    })
  })
  describe("addBalance", () => {  
    it("modifies the balance by adding", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()

      await instance.addBalanceTest(user_1, ERC20.address, 100)

      assert.equal(await instance.getBalance(user_1, ERC20.address), 100)
    })
  })
  describe("substractBalance", () => {  
    it("modifies the balance by substracting", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()

      await instance.addBalanceTest(user_1, ERC20.address, 100)
      await instance.substractBalanceTest(user_1, ERC20.address, 50)

      assert.equal(await instance.getBalance(user_1, ERC20.address), 50)
    })
    it("throws in case of underflow", async () => {
      const instance = await IntervalTokenStoreTestInterface.new()
      const ERC20 = await MockContract.new()
  
      await truffleAssert.reverts(instance.substractBalanceTest(user_1, ERC20.address, 50))
    })
  })
})