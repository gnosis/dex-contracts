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

module.exports = argv