const BatchExchange = artifacts.require("BatchExchange")
const { invokeViewFunction } = require("../script_utilities.js")

module.exports = async (callback) => {
  await invokeViewFunction(BatchExchange, callback)
}
