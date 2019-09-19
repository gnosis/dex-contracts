const { isMigrationRequired } = require("./migration_utilities.js")

async function migrate({
  artifacts,
  deployer,
  network,
}) {
  if (isMigrationRequired(network)) {
    // deploy DevDependencies
    const Dependencies = artifacts.require("./DevDependencies")
    await deployer.deploy(Dependencies)

    // deploy libraries
    const BiMap = artifacts.require("IdToAddressBiMap")
    await deployer.deploy(BiMap)

    const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not in development, so nothing to do. Current network is %s", network)
  }
}

module.exports = migrate
