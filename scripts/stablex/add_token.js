const StablecoinConverter = artifacts.require("StablecoinConverter")
const { getArgumentsHelper } = require("../script_utilities.js")

module.exports = async function (callback) {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 1) {
      callback("Error: This script requires arguments - <token address>")
    }
    const token_address = arguments[0]
    const instance = await StablecoinConverter.deployed()

    await instance.addToken(token_address)

    console.log(`Successfully added token ${token_address}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
