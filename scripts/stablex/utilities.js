const BN = require("bn.js")
const { waitForNSeconds } = require("../../test/utilities.js")
const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

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

const addTokens = async function(token_addresses, web3, artifacts) {
  const accounts = await web3.eth.getAccounts()

  const BatchExchange = artifacts.require("BatchExchange")
  const instance = await BatchExchange.deployed()

  const TokenOWL = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWL")
  const owl = await TokenOWL.at(await instance.feeToken.call())

  const feeForAddingToken = (await instance.FEE_FOR_LISTING_TOKEN_IN_OWL.call()).mul(new BN(token_addresses.length))
  const balanceOfOWL = await owl.balanceOf.call(accounts[0])
  if (feeForAddingToken.gt(balanceOfOWL)) {
    console.log("More fee tokens are required to add all tokens")
    return
  }
  const allowanceOfOWL = await owl.allowance.call(accounts[0], instance.address)
  if (feeForAddingToken.gt(allowanceOfOWL)) {
    await owl.approve(instance.address, feeForAddingToken)
  }

  for (const token_address of token_addresses) {
    if (!(await instance.hasToken.call(token_address))) {
      await instance.addToken(token_address)
      console.log(`Successfully added token ${token_address}`)
    } else {
      console.log(`The token ${token_address} was already added`)
    }
  }
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
    currentUser = page[page.length - 1].user
    currentOffSet = orders.filter(order => order.user == currentUser).length
    lastPageSize = page.length
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

const maxUint32 = new BN(2).pow(new BN(32)).sub(new BN(1))

module.exports = {
  addTokens,
  closeAuction,
  token_list_url,
  fetchTokenInfo,
  sendLiquidityOrders,
  getOrdersPaginated,
  maxUint32,
}
