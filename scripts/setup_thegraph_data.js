const { solutionSubmissionParams, basicTrade } = require("../build/common/test/resources/examples")

const { makeDeposits, placeOrders } = require("../test/stablex/stablex_utils")
const {
  closeAuction,
  getOwl,
  getBatchExchange,
  setAllowances,
  addTokens,
  deleteOrders,
  submitSolution,
  getBatchId,
  createMintableToken,
  mintTokens,
  mintOwl,
} = require("./utilities.js")

const { toETH } = require("../build/common/test/resources/math")
const { waitForNSeconds } = require("../test/utilities")

module.exports = async function (callback) {
  try {
    const batchExchange = await getBatchExchange(artifacts)
    const owl = await getOwl(artifacts)

    // Prepare user accounts
    const [user1Address, user2Address] = await web3.eth.getAccounts()
    const usersAddresses = [user1Address, user2Address]
    const solverAddress = user1Address
    const minter = user1Address

    // Get current batch id
    let batchId = await getBatchId(batchExchange)
    console.log("Current batch id: ", batchId)

    // Set user1 as minter of OWL
    await owl.setMinter(minter)

    // Mint OWL for every user
    const amount = web3.utils.toWei("3000")
    await mintOwl({ users: usersAddresses, minter, amount, owl })

    // Create 1 token
    const token1Instance = await createMintableToken(artifacts)
    const tokensInstances = [token1Instance]

    // Set allowances for OWL and the tokens
    await setAllowances({
      users: usersAddresses,
      amount,
      batchExchange,
      tokens: tokensInstances.concat([owl]),
    })

    // List the tokens in the exchange
    const tokenAddresses = [token1Instance.address]
    const [token1] = await addTokens({
      tokenAddresses,
      account: user1Address,
      batchExchange,
      owl,
    })

    // Mint tokens for every user
    await mintTokens({
      tokens: tokensInstances,
      users: usersAddresses,
      amount,
      minter,
    })

    // Make deposits, place orders and close auction [aka runAuctionScenario(basicTrade)]
    await makeDeposits(batchExchange, usersAddresses, basicTrade.deposits)

    // Place orders
    let orderIds = await placeOrders(batchExchange, usersAddresses, basicTrade.orders, batchId + 1)

    // Request withdraw
    console.log("Request withdraw for user %s, token %s (%d)", user1Address, token1.address, token1.id)
    await batchExchange.requestWithdraw(token1.address, 5, {
      from: user1Address,
    })

    // Close the auction
    console.log("Close auction so we can withdraw the tokens")
    await closeAuction(batchExchange, web3)

    // Withdraw tokens
    console.log("Withdraw for user %s, token %s (%d)", user1Address, token1.address, token1.id)
    await batchExchange.withdraw(user1Address, token1.address, {
      from: user1Address,
    })

    // Submit solution
    await submitSolution({
      name: "Full solution",
      batchId,
      solution: solutionSubmissionParams(basicTrade.solutions[0], usersAddresses, orderIds),
      solverAddress,
      batchExchange,
    })

    // Close auction
    console.log("Close auction after solution has been applied")
    await closeAuction(batchExchange, web3)

    // Cancel the 2 orders
    console.log("Cancel the two orders")
    await deleteOrders({ orderIds, accounts: usersAddresses, batchExchange })

    // Create a new order with validity only for next batch
    batchId = await getBatchId(batchExchange)
    const newOrder = {
      sellToken: 0,
      buyToken: token1.id,
      sellAmount: toETH(10),
      buyAmount: toETH(10),
      user: 0,
    }
    console.log("Place new order: %s", JSON.stringify(newOrder))
    orderIds = await placeOrders(batchExchange, [user1Address], [newOrder], batchId + 1)
    console.log("Placed order with id: ", orderIds.toString(10))

    // Advance time (30min)
    console.log("Advance time 30min to make sure the new order expires")
    await waitForNSeconds(1800, web3)

    // Delete the new order
    await deleteOrders({ orderIds, accounts: [user1Address], batchExchange })

    console.log("Environment setup complete for BatchExchange with address ", batchExchange.address)
    callback()
  } catch (error) {
    callback(error)
  }
}
