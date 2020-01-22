const migrateDependencies = require("../src/migration/dependencies")

module.exports = function(deployer, network, accounts) {
  return migrateDependencies({
    artifacts,
    deployer,
    network,
    account: accounts[0],
  })
}
