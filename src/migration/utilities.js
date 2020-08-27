const Contract = require("@truffle/contract")

function getArtifactFromNpmImport(path, deployer, account) {
  const contract = Contract(require(path))
  contract.setProvider(deployer.provider)
  contract.setNetwork(deployer.network_id)
  contract.defaults({
    from: account,
    gas: 6.5e6,
  })
  return contract
}

function getArtifactFromBuildFolderOrImport(artifacts, deployer, account, path) {
  let contract
  // If this migration script is used from the repository dex-contracts, the contract
  // data is received via the artificats.require.
  // If this migration script is used from an external project, the first try statement
  // will fail and it will get the contracts from the function initializeContract.
  try {
    contract = artifacts.require(path.split("/").pop())
  } catch (error) {
    contract = getArtifactFromNpmImport(path, deployer, account)
  }
  return contract
}

function isDevelopmentNetwork(network) {
  return network === "development" || network === "coverage" || network === "developmentdocker"
}

module.exports = {
  getArtifactFromBuildFolderOrImport,
  isDevelopmentNetwork,
  getArtifactFromNpmImport,
}
