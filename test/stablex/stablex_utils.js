const MockContract = artifacts.require("MockContract")
const BatchExchange = artifacts.require("BatchExchange")

const { sendTxAndGetReturnValue } = require("../utilities")

/**
 * @typedef Deposit
 * @type {object}
 * @property {BN} amount The deposit amount
 * @property {number} token The deposited token
 * @property {number} user The user making the deposit
 */

/**
 * Makes deposit transactions from a list of Deposit Objects
 * @param {number} numTokens - number of tokens to be registered on this exchange.
 * @param {number} maxTokens - Maximum number of tokens (a contract contructor parameter)
 * @param {number} feeDenominator - Fee for order execution (a contract contructor parameter)
 * @returns {}
 */
const setupGenericStableX = async function(numTokens = 2, maxTokens = 2 ** 16 - 1, feeDenominator = 1000) {
  const feeToken = await MockContract.new()
  await feeToken.givenAnyReturnBool(true)

  const instance = await BatchExchange.new(maxTokens, feeDenominator, feeToken.address)
  const tokens = [feeToken]
  for (let i = 0; i < numTokens - 1; i++) {
    const token = await MockContract.new()
    await instance.addToken(token.address)
    await token.givenAnyReturnBool(true)
    tokens.push(token)
  }
  return instance
}

/**
 * Makes deposit transactions from a list of Deposit Objects
 * @param {object} contract BatchExchange smart contract
 * @param {string[]} accounts An array of (unlocked) ethereum account addresses
 * @param {Deposit[]} depositList an array of Deposit Objects
 */
const makeDeposits = async function(contract, accounts, depositList) {
  for (const deposit of depositList) {
    const tokenAddress = await contract.tokenIdToAddressMap.call(deposit.token)
    await contract.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
  }
}

/**
 * Makes placeOrder transactions from a list of Order Objects
 * @param {object} contract BatchExchange smart contract
 * @param {string[]} accounts An array of (unlocked) ethereum account addresses
 * @param {Order[]} - an array of Order Objects
 * @returns {BN[]}
 */
const placeOrders = async function(contract, accounts, orderList, auctionIndex) {
  const orderIds = []
  for (const order of orderList) {
    orderIds.push(
      await sendTxAndGetReturnValue(
        contract.placeOrder,
        order.buyToken,
        order.sellToken,
        auctionIndex,
        order.buyAmount,
        order.sellAmount,
        { from: accounts[order.user] }
      )
    )
  }
  return orderIds
}

module.exports = {
  setupGenericStableX,
  makeDeposits,
  placeOrders,
}
