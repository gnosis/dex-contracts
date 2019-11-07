const migrateSnappAuction = require("../src/migrate_snapp_auction")
const argv = require("../src/migration_utilities")

module.exports = async function (deployer, network) {
  if (!argv.onlyMigrateStableX) {
    return migrateSnappAuction({
      artifacts,
      network,
      deployer
    })
  } else {
    return
  }
}