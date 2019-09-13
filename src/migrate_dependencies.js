
async function migrate({
  artifacts,
  deployer,
  network,
}) {
  if (network === "development" || network == "coverage") {

    // deploy DevDependencies
    const Dependencies = artifacts.require("./DevDependencies.sol")
    await deployer.deploy(Dependencies)

    // deploy libraries
    const BiMap = artifacts.require("IdToAddressBiMap.sol")
    await deployer.deploy(BiMap)

    const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet.sol")
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not in development, so nothing to do. Current network is %s", network)
  }
}

module.exports = migrate
