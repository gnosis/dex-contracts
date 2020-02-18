const BN = require("bn.js")
const { waitForNSeconds } = require("../../test/utilities.js")
const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

const fetchTokenInfo = async function(exchangeContract, tokenIds, artifacts) {
  const ERC20 = artifacts.require("ERC20Detailed")
  console.log("Fetching token data from EVM")
  const tokenObjects = {}
  for (const id of tokenIds) {
    const tokenAddress = await exchangeContract.tokenIdToAddressMap(id)
    const tokenInstance = await ERC20.at(tokenAddress)
    let tokenInfo
    try {
      tokenInfo = {
        id: id,
        symbol: await tokenInstance.symbol.call(),
        decimals: (await tokenInstance.decimals.call()).toNumber(),
      }
    } catch (err) {
      tokenInfo = {
        id: id,
        symbol: "UNKNOWN",
        decimals: "18",
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

module.exports = {
  addTokens,
  closeAuction,
  token_list_url,
  fetchTokenInfo,
}
