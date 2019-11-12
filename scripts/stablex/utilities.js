const BN = require("bn.js")
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

const depositTokens = async function (token_address, depositor, amount, artifacts) {

  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const instance = await StablecoinConverter.deployed()
  const ERC20 = artifacts.require("ERC20.sol")

  const token = await ERC20.at(token_address)
  const depositor_balance = (await token.balanceOf.call(depositor))
  if (depositor_balance.lt(amount)) {
    console.log(`Error: Depositor has insufficient balance ${depositor_balance} < ${amount}.`)
  }

  const allowance = (await token.allowance.call(depositor, instance.address)).toString()
  if (allowance < amount) {
    await token.approve(instance.address, amount, { from: depositor })
  }

  await instance.deposit(token_address, amount, { from: depositor })

}

const placeOrder = async function (buyToken, sellToken, account, validFor, minBuy, maxSell, artifacts) {
  const { sendTxAndGetReturnValue } = require("../../test/utilities.js")

  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const instance = await StablecoinConverter.deployed()

  const batch_index = (await instance.getCurrentBatchId.call()).toNumber()
  const valid_until = batch_index + parseInt(validFor)

  await sendTxAndGetReturnValue(instance.placeOrder, buyToken, sellToken, valid_until, minBuy, maxSell, { from: account })
}

module.exports = {
  placeOrder,
  depositTokens,
  addTokens
}