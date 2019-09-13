
/* global artifacts, web3 */
/* eslint no-undef: "error" */
const migrateDependencies = require("../src/migration_scripts_stablecoinConverter/migrate_dependencies")
const Dependencies = artifacts.require("./DevDependencies.sol")

module.exports = function (deployer, network, accounts) {
  //if (!process.env.DEPLOY_ONLY_SNAPP_AUCTION) {
  migrateDependencies({
    artifacts,
    deployer,
    network,
    accounts,
    web3
  })
  //}
  //if (!process.env.DEPLOY_ONLY_STABLECOIN_CONVERTER) {
  deployer.deploy(Dependencies)
  //}
  return
}