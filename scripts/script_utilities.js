const BN = require("bn.js")

const getArgumentsHelper = function () {
  const arguments = process.argv.slice(4)
  const index = arguments.indexOf("--network")
  if (index > -1) {
    arguments.splice(index, 2)
  }
  return arguments
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
    const arguments = getArgumentsHelper()
    if (arguments.length < 1) {
      callback("Error: This script requires arguments - <functionName> [..args]")
    }
    const [functionName, ...args] = arguments

    const instance = await contract.deployed()
    const info = await instance[functionName].call(...args)

    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}

const addTokens = async function (token_addresses, web3, artifacts) {
  const accounts = await web3.eth.getAccounts()

  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const instance = await StablecoinConverter.deployed()

  const TokenOWL = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWL")
  const owl = await TokenOWL.at(await instance.feeToken.call())

  const allowanceOfOWL = await owl.allowance.call(accounts[0], instance.address)
  const feeForAddingToken = (await instance.TOKEN_ADDITION_FEE_IN_OWL.call()).mul(new BN(token_addresses.length))
  if (allowanceOfOWL < feeForAddingToken) {
    await owl.approve(instance.address, feeForAddingToken)
  }

  for (const i in token_addresses) {
    await instance.addToken(token_addresses[i])
    console.log(`Successfully added token ${token_addresses[i]}`)
  }
}

module.exports = {
  getArgumentsHelper,
  getOrderData,
  invokeViewFunction,
  addTokens
}
