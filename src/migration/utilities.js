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

function isDevelopmentNetwork(network) {
  return network === "development" || network === "coverage" || network === "developmentdocker"
}

module.exports = {
  isDevelopmentNetwork,
  getArtifactFromNpmImport,
}
