/*eslint no-undef: "off"*/

const migrateSnappAuction = require("../src/migration_scripts_snappAuction/migrate_snapp_auction")
const argv = require("../src/migration_utilities")


module.exports = async function (deployer) {
  if (!argv.onlyMigrateStableX) {
    return migrateSnappAuction({
      artifacts,
      deployer
    })
  } else {
    return
  }
}