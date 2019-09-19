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

function isMigrationRequired(network) {
  if (network === "development" || network == "coverage" || network == "developmentdocker" || network == "development-fork") {
    return true
  } else {
    return false
  }
}
module.exports = {
  argv,
  isMigrationRequired
}