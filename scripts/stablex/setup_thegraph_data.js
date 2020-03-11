const { solutionSubmissionParams, generateTestCase } = require("../../test/resources/examples")

const { makeDeposits, placeOrders } = require("../../test/stablex/stablex_utils")
const { closeAuction } = require("../../scripts/stablex/utilities.js")
const { decodeOrdersBN } = require("../../src/encoding")

const { toETH, feeAdded, feeSubtracted, ERROR_EPSILON } = require("../../test/resources/math")
const { waitForNSeconds } = require("../../test/utilities")

const BatchExchange = artifacts.require("BatchExchange")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")

async function _getOwl() {
  const TokenOWL = artifacts.require("TokenOWL")
  const TokenOWLProxy = artifacts.require("TokenOWLProxy")
  const owlProxyContract = await TokenOWLProxy.deployed()
  return TokenOWL.at(owlProxyContract.address)
}

async function _mintOWL({ owl, user, amount, batchExchange }) {
  console.log("Mint %d of OWL for user %s (%d)", amount, user.address, user.id)
  await owl.mintOWL(user.address, amount)
  await owl.approve(batchExchange.address, amount)
}

async function _createAndAddToken(batchExchange) {
  const token = await ERC20Mintable.new()
  await batchExchange.addToken(token.address)
  const tokenId = await batchExchange.tokenAddressToIdMap(token.address)
  const id = tokenId.toNumber()

  console.log("Added token %s with id %d", token.address, id)
  return {
    id,
    address: token.address,
    instance: token,
  }
}

async function _mintToken({ token, user, amount, batchExchange }) {
  console.log("Mint token %d of token %s for user %s (%d)", amount, token.address, user.address, user.id)
  await token.instance.mint(user.address, amount)
  await token.instance.approve(batchExchange.address, amount, { from: user.address })
}

async function _getBatchId(batchExchange) {
  const batchId = await batchExchange.getCurrentBatchId.call()
  return batchId.toNumber()
}

function _getTestCase({ user1, user2, token1 }) {
  console.log("Generate test case: Sell token %d for OWL and OWL for %d", token1.id, token1.id)
  return generateTestCase({
    name: "Basic Trade",
    orders: [
      {
        sellToken: 0, // owl
        buyToken: token1.id,
        sellAmount: feeAdded(toETH(20)).add(ERROR_EPSILON),
        buyAmount: toETH(10),
        user: user1.id,
      },
      {
        sellToken: token1.id,
        buyToken: 0, // owl
        sellAmount: toETH(10),
        buyAmount: feeSubtracted(toETH(20)).sub(ERROR_EPSILON),
        user: user2.id,
      },
    ],
    solutions: [
      {
        name: "Full Solution",
        prices: [1, 2].map(toETH),
        buyVolumes: [toETH(10), feeSubtracted(toETH(20))],
      },
      {
        name: "Partial Solution",
        prices: [1, 2].map(toETH),
        buyVolumes: [toETH(9), feeSubtracted(toETH(18))],
      },
    ],
  })
}

async function _submitSolution(name, batchId, solution, solver, batchExchange) {
  console.log(`Submit "${name}": ${JSON.stringify(solution)}`)
  const objectiveValue = await batchExchange.submitSolution(
    batchId,
    1,
    solution.owners,
    solution.touchedorderIds,
    solution.volumes,
    solution.prices,
    solution.tokenIdsForPrice,
    { from: solver }
  )
  console.log(`Transaction for ${name}: ${objectiveValue.tx}`)
}

async function _deleteOrder({ orderId, user, batchExchange }) {
  const cancelReceipt = await batchExchange.cancelOrders([orderId], { from: user.address })
  const events = cancelReceipt.logs.map(log => log.event).join(", ")
  console.log("Canceled/Deleted order %d. Emitted events: %s", orderId, events)
}

async function _createOrder({ user, buyToken, sellToken, validUntil, buyAmount, sellAmount, batchExchange }) {
  // placeOrder(uint16 buyToken, uint16 sellToken, uint32 validUntil, uint128 buyAmount, uint128 sellAmount)
  console.log(
    "Create new order for user %s. Buy %s for %s at %s/%s",
    user.address,
    buyToken.id,
    sellToken.id,
    buyAmount,
    sellAmount
  )
  await batchExchange.placeOrder(buyToken.id, sellToken.id, validUntil, buyAmount, sellAmount, {
    from: user.address,
  })
  const auctionElements = decodeOrdersBN(await batchExchange.getEncodedUserOrders(user.address))
  const newOrder = auctionElements[auctionElements.length - 1]
  return {
    id: auctionElements.length - 1,
    data: newOrder,
  }
}

module.exports = async function(callback) {
  try {
    const batchExchange = await BatchExchange.deployed()

    // Prepare user accounts
    const accounts = await web3.eth.getAccounts()
    const [user1Address, user2Address] = accounts
    const user1 = { id: 0, address: user1Address }
    const user2 = { id: 1, address: user2Address }
    const solver = user1

    // Get current batch id
    let batchId = await _getBatchId(batchExchange)
    console.log("Current batch id: ", batchId)

    // Set user1 as minter of OWL
    const owl = await _getOwl()
    await owl.setMinter(user1.address)

    // Mint owl for user1 and user2
    const amount = web3.utils.toWei("3000")
    await _mintOWL({ user: user1, owl, amount, batchExchange })
    await _mintOWL({ user: user2, owl, amount, batchExchange })

    // Create 3 tokens
    const token1 = await _createAndAddToken(batchExchange)
    const token2 = await _createAndAddToken(batchExchange)
    // const token3 = _createAndAddToken(batchExchange)

    // Mint the 2 tokens for the 2 users
    // const tokens = [owl, token1, token2, token3]
    const tokens = [token1, token2]
    tokens.forEach(token => {
      _mintToken({ token, user: user1, amount, batchExchange })
      _mintToken({ token, user: user2, amount, batchExchange })
    })

    // Generate a basic test case
    const testCase = _getTestCase({ user1, user2, token1, token2 })

    // Make deposits, place orders and close auction [aka runAuctionScenario(basicTrade)]
    console.log(
      "Deposits: ",
      testCase.deposits
        .map(deposit => ({
          ...deposit,
          amount: deposit.amount.toString(),
        }))
        .join(", ")
    )
    await makeDeposits(batchExchange, accounts, testCase.deposits)

    // Place orders
    const orderIds = await placeOrders(batchExchange, accounts, testCase.orders, batchId + 1)

    // Request withdraw
    console.log("Request withdraw", user1.address, token1.id)
    await batchExchange.requestWithdraw(token1.address, 5, { from: user1.address })

    // Close the auction
    console.log("Close auction so we can withdraw the tokens")
    await closeAuction(batchExchange, web3)

    // Withdraw tokens
    console.log("Withdraw", user1.address, token1.id)
    await batchExchange.withdraw(user1.address, token1.address, { from: user1.address })

    // Submit solution
    const fullSolution = solutionSubmissionParams(testCase.solutions[0], accounts, orderIds)
    await _submitSolution("Full solution", batchId, fullSolution, solver.address, batchExchange)

    // Close auction
    console.log("Close auction after solution has been applied")
    await closeAuction(batchExchange, web3)

    // Cancel the 2 orders
    console.log("Cancel the two orders")
    const [order1, order2] = orderIds
    await _deleteOrder({ orderId: order1, user: user1, batchExchange })
    await _deleteOrder({ orderId: order2, user: user2, batchExchange })

    // Create a new order with validity only for next batch
    batchId = await _getBatchId(batchExchange)
    const newOrder = await _createOrder({
      user: user1,
      buyToken: token1,
      sellToken: token2,
      buyAmount: toETH(10),
      sellAmount: toETH(20),
      validUntil: batchId + 2,
      batchExchange,
    })

    // Advance time (30min)
    console.log("Advance time 30min to make sure the new order expires")
    await waitForNSeconds(1800, web3)

    // Delete the new order
    await _deleteOrder({ orderId: newOrder.orderId, user: user1, batchExchange })

    console.log("Environment setup complete for BatchExchange with address ", batchExchange.address)
    callback()
  } catch (error) {
    callback(error)
  }
}
