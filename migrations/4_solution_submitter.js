const BatchExchange = artifacts.require("BatchExchange.sol")
const SolutionSubmitter = artifacts.require("SolutionSubmitter.sol")

const GAS_TOKEN_ADDRESS = "0x0000000000004946c0e9F43F4Dee607b0eF1fA1c"
const GAS_TOKEN_USAGE_THRESHOLD = 60000000000

module.exports = async function (deployer, network) {
  if (network === "mainnet") {
    const exchange = await BatchExchange.deployed()
    await deployer.deploy(SolutionSubmitter, exchange.address, GAS_TOKEN_ADDRESS, GAS_TOKEN_USAGE_THRESHOLD)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not deploying SolutionSubmitter on network: ", network)
  }
}
