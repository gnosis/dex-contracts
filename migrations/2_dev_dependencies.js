const migrateDependencies = require("../src/migration/dependencies")

module.exports = function(deployer, network) {
  return migrateDependencies({
    artifacts,
    deployer,
    network,
  })
}
