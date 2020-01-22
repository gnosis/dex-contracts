function initializeContract(path, deployer, accounts) {
  const contract = require("truffle-contract")

  const Contract = contract(require(path))
  Contract.setProvider(deployer.provider)
  Contract.setNetwork(deployer.network_id)
  // For some reason the automatic value calculation is not working, hence we do:
  Contract.defaults({
    from: accounts[0],
    gas: 8e6,
  })
  return Contract
}

function getDependency(artifacts, network, deployer, accounts, path) {
  let Contract

  if (isDevelopmentNetwork(network)) {
    // If this migration script is used from the repository dex-contracts, the contract
    // data is received via the artificats.require.
    // If this migration script is used from an external project, the first try statement
    // will fail and it will get the contracts from the function initializeContract.
    try {
      Contract = artifacts.require(path.split("/").pop())
    } catch (error) {
      Contract = initializeContract(path, deployer, accounts)
    }
  } else {
    Contract = initializeContract(path, deployer, accounts)
  }
  return Contract
}

function isDevelopmentNetwork(network) {
  return network === "development" || network === "coverage" || network === "developmentdocker"
}

module.exports = {
  getDependency,
  isDevelopmentNetwork,
}
