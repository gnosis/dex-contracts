const migrateStablecoinConverter = require("../src/migrate_PoC_dfusion")
const argv = require("yargs")
  .option("onlyMigrateSnappAuction", {
    describe: "Allows to restrict the migration only to SnappAuction",
  })
  .help(false)
  .version(false).argv

module.exports = async function(deployer, network, accounts, web3) {
  if (!argv.onlyMigrateSnappAuction) {
    return migrateStablecoinConverter({
      artifacts,
      deployer,
      network,
      accounts,
      web3,
    })
  } else {
    return
  }
}
