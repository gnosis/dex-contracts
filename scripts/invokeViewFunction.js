const BatchExchange = artifacts.require("BatchExchange");
const { invokeViewFunction } = require("./utilities.js");

module.exports = async (callback) => {
  await invokeViewFunction(BatchExchange, callback);
};
