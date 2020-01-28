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

async function getDeployedDependency(artifacts, deployer, account, path) {
  let contract
  // The following logic tries to get the deployed dependency from the local build folder, and falls back to
  // npm imports. This makes sure that the script can be used within dex-contracts and from external projects.
  try {
    contract = artifacts.require(path.split("/").pop())
    await contract.deployed()
  } catch (error) {
    contract = initializeContract(path, deployer, account)
    await contract.deployed()
  }
  return contract
}

function getArtifact(artifacts, deployer, account, path) {
  let contract
  try {
    contract = artifacts.require(path.split("/").pop())
  } catch (error) {
    contract = initializeContract(path, deployer, account)
  }
  return contract
}

function isDevelopmentNetwork(network) {
  return network === "development" || network === "coverage" || network === "developmentdocker"
}

module.exports = {
  getDeployedDependency,
  getArtifact,
  isDevelopmentNetwork,
}
