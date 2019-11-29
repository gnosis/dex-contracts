const migrateDependencies = require("../src/migrate_dependencies.js")

module.exports = function(deployer, network) {
  return migrateDependencies({
    artifacts,
    deployer,
    network,
  })
}
