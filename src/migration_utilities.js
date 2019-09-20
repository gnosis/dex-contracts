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


function getNetworkId(name) {
  const { NETWORK_IDS } = require("@gnosis.pm/util-contracts/src/util/networkUtils")
  return NETWORK_IDS[name.replace("-fork", "")].network_id
}

function getDependency(artifacts, network, deployer, path) {
  let Contract

  if (network === "development" || network === "coverage") {
    Contract = artifacts.require(path)
  } else {
    const contract = require("truffle-contract")

    Contract = contract(require(path))
    Contract.setProvider(deployer.provider)
    Contract.setNetwork(getNetworkId(network))
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