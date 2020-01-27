function initializeContract(path, deployer, account) {
  const Contract = require("@truffle/contract")

  const contract = Contract(require(path))
  contract.setProvider(deployer.provider)
  contract.setNetwork(deployer.network_id)
  // For some reason the automatic value calculation is not working, hence we do:
  contract.defaults({
    from: account,
    gas: 6.5e6,
  })
  return contract
}

async function getDependency(artifacts, network, deployer, account, path, contractNeedsToBeDeployed = true) {
  let contract
  // The following logic ensures the right artifacts are used, no matter whether the migration scripts are run from an
  // external project or this dex-contracts project.
  try {
    contract = artifacts.require(path.split("/").pop())
    if (contractNeedsToBeDeployed) {
      await contract.deployed()
    }
  } catch (error) {
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
