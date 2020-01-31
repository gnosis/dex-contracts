const migrateSnappAuction = require("../src/migration/snapp_auction")
const argv = require("yargs")
  .option("onlyMigrateStableX", {
    describe: "Allows to restrict the migration only to StableX",
  })
  .help(false)
  .version(false).argv

module.exports = async function(deployer, network, accounts) {
  if (!argv.onlyMigrateStableX) {
    return migrateSnappAuction({
      artifacts,
      network,
      deployer,
      account: accounts[0],
    })
  } else {
    return
  }
}
