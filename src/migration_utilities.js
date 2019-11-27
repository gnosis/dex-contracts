function getDependency(artifacts, network, deployer, path) {
  let Contract

  if (isDevelopmentNetwork(network)) {
    Contract = artifacts.require(path)
  } else {
    const contract = require("truffle-contract")

    Contract = contract(require(path))
    Contract.setProvider(deployer.provider)
    Contract.setNetwork(deployer.network_id)
  }
  return Contract
}

function isDevelopmentNetwork(network) {
  return (
    network === "development" ||
    network === "coverage" ||
    network === "developmentdocker"
  )
}

module.exports = {
  getDependency,
  isDevelopmentNetwork
}
