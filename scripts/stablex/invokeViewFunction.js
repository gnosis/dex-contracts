const StablecoinConverter = artifacts.require("StablecoinConverter")
const {invokeViewFunction} = require("../script_utilities.js")

module.exports = async callback => {
  await invokeViewFunction(StablecoinConverter, callback)
}
