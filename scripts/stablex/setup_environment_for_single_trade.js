// Prerequisit for this script:
// Have an account funded with Rinkeby OWL 
// This simple script will set up a trade between OWL and A New Token
const StablecoinConverter = artifacts.require("StablecoinConverter")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const { addTokens, depositTokens, placeOrder } = require("./utilities.js")

module.exports = async function (callback) {
  try {

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const account = accounts[0]

    const TokenOWL = artifacts.require("TokenOWL")
    console.log(await instance.feeToken.call())
    const owlToken = await TokenOWL.at(await instance.feeToken.call())

    const amount = (10 ** 18).toString()


    const token = await ERC20Mintable.new()
    await token.mint(account, amount)
    await addTokens([token.address], web3, artifacts)

    await depositTokens(owlToken.address, account, amount, artifacts, callback)
    await depositTokens(token.address, account, amount, artifacts, callback)

    const valid_for = 2 ** 10
    await placeOrder(0, 1, account, valid_for, Math.floor(amount / 1000 * 99).toString(), Math.floor(amount * 1000 / 999).toString(), artifacts)
    await placeOrder(1, 0, account, valid_for, Math.floor(amount / 1000 * 99).toString(), Math.floor(amount * 1000 / 999).toString(), artifacts)

    console.log("Primitive trading against oneself is setup")
    callback()
  } catch (error) {
    callback(error)
  }
}