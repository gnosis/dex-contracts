const migrateSnappAuction = require("../src/migrate_snapp_auction")
const argv = require("yargs")
  .option("onlyMigrateStableX", {
    describe: "Allows to restrict the migration only to StableX",
  })
  .help(false)
  .version(false).argv

module.exports = async function(deployer, network) {
  if (!argv.onlyMigrateStableX) {
    return migrateSnappAuction({
      artifacts,
      network,
      deployer,
    })
  } else {
    return
  }
}
