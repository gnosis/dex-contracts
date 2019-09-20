const argv = require("yargs")
  .option("onlyMigrateStableX", {
    describe: "Allows to restrict the migration only to StableX"
  })
  .option("onlyMigrateSnappAuction", {
    describe: "Allows to restrict the migration only to SnappAuction"
  })
  .help(false)
  .version(false)
  .argv

const network2id = {
  mainnet: 1,
  kovan: 42,
  rinkeby: 4,
  ropsten: 3
}

function getDependency(artifacts, network, deployer, path) {
  let Contract

  if (network === "development" || network === "coverage") {
    Contract = artifacts.require(path)
  } else {
    const contract = require("truffle-contract")

    Contract = contract(require(path))
    Contract.setProvider(deployer.provider)
    Contract.setNetwork(network2id[network.replace("-fork", "")])
  }
  return Contract
}

function isMigrationRequired(network) {
  return (network === "development" || network === "coverage" || network === "developmentdocker")
}

module.exports = {
  argv,
  isMigrationRequired,
  getDependency
}