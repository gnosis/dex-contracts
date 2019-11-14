
/**
 * @typedef Deposit
 * @type {object}
 * @property {BN} amount The deposit amount
 * @property {number} token The deposited token
 * @property {number} user The user making the deposit
 */


/**
 * Converts the amount value to `ether` unit.
 * @param {contract}
 * @param {accounts}
 * @param {Deposit[]}
 */
const makeDeposits = async function (contract, accounts, depositList) {
  for (const deposit of depositList) {
    const tokenAddress = await contract.tokenIdToAddressMap.call(deposit.token)
    await contract.deposit(tokenAddress, deposit.amount, { from: accounts[deposit.user] })
  }
}

/**
 * Converts the amount value to `ether` unit.
 * @param {contract}
 * @param {accounts}
 * @param {Order[]}
 */
const placeOrders = async function (contract, accounts, orderList, auctionIndex) {
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


const sendTxAndGetReturnValue = async function (method, ...args) {
  const result = await method.call(...args)
  await method(...args)
  return result
}

module.exports = {
  makeDeposits,
  placeOrders,
}