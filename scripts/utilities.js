const BN = require("bn.js")
const { waitForNSeconds } = require("../build/common/test/utilities.js")
const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

const getArgumentsHelper = function () {
  const args = process.argv.slice(4)
  const index = args.indexOf("--network")
  if (index > -1) {
    args.splice(index, 2)
  }
  return args
}

const getOrderData = async function (instance, callback, web3, argv) {
  const minBuy = web3.utils.toWei(String(argv.minBuy))
  const maxSell = web3.utils.toWei(String(argv.maxSell))

  const sender = await instance.accountToPublicKeyMap.call(argv.accountId)
  if (sender == 0x0) {
    callback(`Error: No account registerd at index ${argv.accountId}`)
  }

  const buyTokenAddress = await instance.tokenIdToAddressMap.call(argv.buyToken)
  if (buyTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.buyToken}`)
  }

  const sellTokenAddress = await instance.tokenIdToAddressMap.call(argv.sellToken)
  if (sellTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.sellToken}`)
  }

  return [argv.buyToken, argv.sellToken, minBuy, maxSell, sender]
}

const invokeViewFunction = async function (contract, callback) {
  try {
    const args = getArgumentsHelper()
    if (args.length < 1) {
      callback("Error: This script requires arguments - <functionName> [..args]")
    }
    const [functionName, ...arg] = args

    const instance = await contract.deployed()
    const info = await instance[functionName].call(...arg)

    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}

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

const fetchTokenInfo = async function (
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

const addTokens = async function ({ tokenAddresses, account, batchExchange, owl }) {
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
    const events = cancelReceipt.logs.map((log) => log.event).join(", ")
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
  getArgumentsHelper,
  getOrderData,
  invokeViewFunction,
  getOwl,
  getBatchExchange,
  addTokens,
  closeAuction,
  token_list_url,
  fetchTokenInfo,
  sendLiquidityOrders,
  maxUint32,
  setAllowances,
  mintOwl,
  deleteOrders,
  submitSolution,
  getBatchId,
  createMintableToken,
  mintTokens,
}
