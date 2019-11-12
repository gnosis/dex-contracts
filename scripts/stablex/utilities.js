const BN = require("bn.js")
const addTokens = async function (token_addresses, web3, artifacts) {
  const accounts = await web3.eth.getAccounts()

  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const instance = await StablecoinConverter.deployed()

  const TokenOWL = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWL")
  const owl = await TokenOWL.at(await instance.feeToken.call())

  const feeForAddingToken = (await instance.TOKEN_ADDITION_FEE_IN_OWL.call()).mul(new BN(token_addresses.length))
  const balanceOfOWL = await owl.balanceOf.call(accounts[0])
  if (balanceOfOWL < feeForAddingToken) {
    console.log("More fee tokens are required to add all tokens")
    return
  }
  const allowanceOfOWL = await owl.allowance.call(accounts[0], instance.address)
  if (allowanceOfOWL < feeForAddingToken) {
    await owl.approve(instance.address, feeForAddingToken)
  }

  for (const i in token_addresses) {
    if (!(await instance.hasToken.call(token_addresses[i]))) {
      await instance.addToken(token_addresses[i])
      console.log(`Successfully added token ${token_addresses[i]}`)
    } else {
      console.log(`The token ${token_addresses[i]} was already added`)
    }
  }
}

module.exports = {
  addTokens
}