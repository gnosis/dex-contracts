const argv = require("../src/migration_utilities")
const migrateStablecoinConverter = require("../src/migration_scripts_stablecoinConverter/migrate_PoC_dfusion")

module.exports = async function (deployer, network, accounts, web3) {
  if (!argv.onlyMigrateSnappAuction) {
    return migrateStablecoinConverter({
      artifacts,
      deployer,
      network,
      accounts,
      web3
    })
  } else {
    return
  }
}