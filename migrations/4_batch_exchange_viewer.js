const BatchExchangeViewer = artifacts.require("./BatchExchangeViewer.sol")
const BatchExchange = artifacts.require("./BatchExchange.sol")

module.exports = async function(deployer) {
  const exchange = await BatchExchange.deployed()
  await deployer.deploy(BatchExchangeViewer, exchange.address)
}
