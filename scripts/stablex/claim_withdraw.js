const StablecoinConverter = artifacts.require("StablecoinConverter")
const ERC20 = artifacts.require("ERC20")
const zero_address = 0x0
const { getArgumentsHelper } = require("../script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 2) {
      callback("Error: This script requires arguments - <accountId> <tokenId>")
    }
    const [accountId, tokenId] = arguments

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const withdrawer = accounts[accountId]

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
    }
    const token = await ERC20.at(token_address)

    const balance_before = await token.balanceOf(withdrawer)
    await instance.withdraw(token_address, { from: withdrawer })
    const balance_after = await token.balanceOf(withdrawer)

    console.log(`Success! Balance of token ${tokenId} before claim: ${balance_before}, after claim: ${balance_after}`)
    callback()
  } catch (error) {
    callback(error)
  }
}