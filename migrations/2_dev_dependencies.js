
/* global artifacts, web3 */
/* eslint no-undef: "error" */
const migrateDependencies = require("../src/migrate_dependencies.js")

module.exports = function (deployer, network) {
  return migrateDependencies({
    artifacts,
    deployer,
    network
  })
}