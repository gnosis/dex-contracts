function initializeContract(path, deployer, accounts) {
  const Contract = require("truffle-contract")

  const contract = Contract(require(path))
  contract.setProvider(deployer.provider)
  contract.setNetwork(deployer.network_id)
  // For some reason the automatic value calculation is not working, hence we do:
  contract.defaults({
    from: accounts[0],
    gas: 6.5e6,
  })
  return contract
}

function getDependency(artifacts, network, deployer, account, path) {
  let contract

  if (isDevelopmentNetwork(network)) {
    // If this migration script is used from the repository dex-contracts, the contract
    // data is received via the artificats.require.
    // If this migration script is used from an external project, the first try statement
    // will fail and it will get the contracts from the function initializeContract.
    try {
      contract = artifacts.require(path.split("/").pop())
    } catch (error) {
      contract = initializeContract(path, deployer, account)
    }
  } else {
    contract = initializeContract(path, deployer, account)
  }
  return contract
}

function isDevelopmentNetwork(network) {
  return network === "development" || network === "coverage" || network === "developmentdocker"
}

module.exports = {
  getDependency,
  isDevelopmentNetwork,
}
