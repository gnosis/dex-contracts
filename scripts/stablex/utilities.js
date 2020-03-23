const BN = require("bn.js")
const { waitForNSeconds } = require("../../test/utilities.js")
const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

async function getBatchExchange(artifacts) {
  const BatchExchange = artifacts.require("BatchExchange")
  return BatchExchange.deployed()
}

async function getOwl(artifacts) {
  const TokenOWL = artifacts.require("TokenOWL")
  const batchExchange = await getBatchExchange(artifacts)
  const owlAddress = await batchExchange.feeToken.call()

  return TokenOWL.at(owlAddress)
}

async function createMintableToken(artifacts) {
  const ERC20Mintable = artifacts.require("ERC20Mintable")
  return ERC20Mintable.new()
}

const fetchTokenInfo = async function(
  exchangeContract,
  tokenIds,
  artifacts,
  fallbackSymbolName = "UNKNOWN",
  fallbackDecimals = "UNKNOWN"
) {
  const ERC20 = artifacts.require("ERC20Detailed")
  console.log("Fetching token data from EVM")
  const tokenObjects = {}
  for (const id of tokenIds) {
    const tokenAddress = await exchangeContract.tokenIdToAddressMap.call(id)
    let tokenInfo
    try {
      const tokenInstance = await ERC20.at(tokenAddress)
      tokenInfo = {
        id: id,
        symbol: await tokenInstance.symbol.call(),
        decimals: (await tokenInstance.decimals.call()).toNumber(),
      }
    } catch (err) {
      tokenInfo = {
        id: id,
        symbol: fallbackSymbolName,
        decimals: fallbackDecimals,
      }
    }
    tokenObjects[id] = tokenInfo
    console.log(`Found Token ${tokenInfo.symbol} at ID ${tokenInfo.id} with ${tokenInfo.decimals} decimals`)
  }
  return tokenObjects
}

const addTokens = async function({ tokenAddresses, account, batchExchange, owl }) {
  // Get amount of required OWL for listing all tokens
  const feeForAddingToken = await batchExchange.FEE_FOR_LISTING_TOKEN_IN_OWL.call()
  const totalFees = feeForAddingToken.mul(new BN(tokenAddresses.length))

  // Ensure the user has enough OWL balance
  const balanceOfOWL = await owl.balanceOf.call(account)
  if (totalFees.gt(balanceOfOWL)) {
    throw new Error("More fee tokens are required to add all tokens")
  }

  // Set OWL allowance if necessary
  const allowanceOfOWL = await owl.allowance.call(account, batchExchange.address)
  if (totalFees.gt(allowanceOfOWL)) {
    await setAllowance({ token: owl, account, amount: totalFees, batchExchange })
  }

  // List all tokens (if not listed previously)
  const tokens = []
  for (const tokenAddress of tokenAddresses) {
    const isTokenListed = await batchExchange.hasToken.call(tokenAddress)

    if (!isTokenListed) {
      await batchExchange.addToken(tokenAddress)
      console.log(`Successfully added token ${tokenAddress}`)
    } else {
      console.log(`The token ${tokenAddress} was already added`)
    }

    // Get token information
    const tokenId = await batchExchange.tokenAddressToIdMap(tokenAddress)
    tokens.push({
      id: tokenId.toNumber(),
      address: tokenAddress,
    })
  }

  // Return token information
  return tokens
}

const closeAuction = async (instance, web3Provider = web3) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1, web3Provider)
}

const getOrdersPaginated = async (instance, pageSize) => {
  const { decodeOrdersBN } = require("../../src/encoding")
  let orders = []
  let currentUser = "0x0000000000000000000000000000000000000000"
  let currentOffSet = 0
  let lastPageSize = pageSize
  while (lastPageSize == pageSize) {
    const page = decodeOrdersBN(await instance.getEncodedUsersPaginated(currentUser, currentOffSet, pageSize))
    orders = orders.concat(page)
    for (const index in page) {
      if (page[index].user != currentUser) {
        currentUser = page[index].user
        currentOffSet = 0
      }
      currentOffSet += 1
    }
    lastPageSize = page.length
  }
  return orders
}

const getOpenOrdersPaginated = async function(instance, pageSize) {
  const { decodeOrdersBN } = require("../../src/encoding")
  let orders = []
  let nextPageUser = "0x0000000000000000000000000000000000000000"
  let nextPageUserOffset = 0
  let lastPageSize = pageSize

  while (lastPageSize == pageSize) {
    console.log("Fetching Page")
    const page = await instance.getOpenOrderBookPaginated([], nextPageUser, nextPageUserOffset, pageSize)
    const elements = decodeOrdersBN(page.elements)
    orders = orders.concat(elements)

    //Update page info
    lastPageSize = elements.length
    nextPageUser = page.nextPageUser
    nextPageUserOffset = page.nextPageUserOffset
  }
  return orders
}

const sendLiquidityOrders = async function(
  instance,
  tokenIds,
  PRICE_FOR_LIQUIDITY_PROVISION,
  SELL_ORDER_AMOUNT_OWL,
  artifacts,
  OWL_NUMBER_DIGITS = 18
) {
  const minBuyAmount = []
  const validTokenIds = []

  for (const tokenId of tokenIds) {
    const numberOfDigits = (await fetchTokenInfo(instance, [tokenId], artifacts))[tokenId].decimals
    if (numberOfDigits !== "UNKNOWN") {
      validTokenIds.push(tokenId)
      if (numberOfDigits < OWL_NUMBER_DIGITS) {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).div(
            new BN(10).pow(new BN(OWL_NUMBER_DIGITS - numberOfDigits))
          )
        )
      } else {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).mul(
            new BN(10).pow(new BN(numberOfDigits - OWL_NUMBER_DIGITS))
          )
        )
      }
    }
  }
  const numberOfOrders = validTokenIds.length
  const batchId = (await instance.getCurrentBatchId()).toNumber()
  if (numberOfOrders == 0) {
    console.log(
      "No liquidity orders will be added, as all tokens have already received liquidity, or their decimals could not be determined"
    )
    return
  }
  await instance.placeValidFromOrders(
    validTokenIds, //sellToken
    Array(numberOfOrders).fill(0), //buyToken
    Array(numberOfOrders).fill(batchId + 2), //validFrom
    Array(numberOfOrders).fill(maxUint32), //validTo
    minBuyAmount, //buyAmount
    Array(numberOfOrders).fill(SELL_ORDER_AMOUNT_OWL) //sellAmount
  )
  console.log(
    "Placed liquidity sell orders for the following tokens",
    await Promise.all(validTokenIds.map(async i => await instance.tokenIdToAddressMap.call(i)))
  )
}

async function _mintOwl({ account, minter, amount, owl }) {
  console.log("Mint %d of OWL for user %s", amount, account)
  return owl.mintOWL(account, amount, { from: minter })
}

async function mintTokens({ tokens, minter, users, amount }) {
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < users.length; j++) {
      await mintToken({ token: tokens[i], account: users[j], minter, amount })
    }
  }
}

async function mintToken({ token, account, minter, amount }) {
  console.log("Mint %d of token %s for user %s. Using %s as the minter", amount, token.address, account, minter)
  await token.mint(account, amount, { from: minter })
}

async function deleteOrders({ orderIds, accounts, batchExchange }) {
  console.log("Cancel %d orders for %d users", orderIds.length, accounts.length)
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i]
    const account = accounts[i]
    const cancelReceipt = await batchExchange.cancelOrders([orderId], { from: account })
    const events = cancelReceipt.logs.map(log => log.event).join(", ")
    console.log("Canceled/Deleted order %s for user %s. Emitted events: %s", orderId.toString(10), account, events)
  }
}

async function getBatchId(batchExchange) {
  const batchId = await batchExchange.getCurrentBatchId.call()
  return batchId.toNumber()
}

async function submitSolution({ name, batchId, solution, solverAddress, batchExchange }) {
  console.log(`Submit "${name}":
  - Objective value: ${solution.objectiveValue}
  - Touched orders: ${solution.touchedorderIds.join(", ")}
  - Volumes: ${solution.volumes.join(", ")}
  - Prices: ${solution.prices.join(", ")}
  - Token ids for prices: ${solution.tokenIdsForPrice.join(", ")}`)
  const objectiveValue = await batchExchange.submitSolution(
    batchId,
    1,
    solution.owners,
    solution.touchedorderIds,
    solution.volumes,
    solution.prices,
    solution.tokenIdsForPrice,
    { from: solverAddress }
  )
  console.log(`Transaction for ${name}: ${objectiveValue.tx}`)
}

async function setAllowances({ users, amount, batchExchange, tokens }) {
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      await setAllowance({
        token: tokens[j],
        account: users[i],
        amount,
        batchExchange,
      })
    }
  }
}

async function setAllowance({ token, account, amount, batchExchange }) {
  console.log("Set allowance of %d for token %s and user %s", amount, token.address, account)
  await token.approve(batchExchange.address, amount, { from: account })
}

async function mintOwl({ users, minter, amount, owl }) {
  for (let i = 0; i < users.length; i++) {
    await _mintOwl({ account: users[i], minter, amount, owl })
  }
}

const maxUint32 = new BN(2).pow(new BN(32)).sub(new BN(1))

module.exports = {
  getOwl,
  getBatchExchange,
  addTokens,
  closeAuction,
  token_list_url,
  fetchTokenInfo,
  sendLiquidityOrders,
  getOrdersPaginated,
  getOpenOrdersPaginated,
  maxUint32,
  setAllowances,
  mintOwl,
  deleteOrders,
  submitSolution,
  getBatchId,
  createMintableToken,
  mintTokens,
}
