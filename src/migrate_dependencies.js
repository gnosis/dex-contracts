async function migrate({
  artifacts,
  deployer,
  network,
}) {
  if (network === "development" || network == "coverage" || network == "development-fork") {
    // deploy DevDependencies
    const Dependencies = artifacts.require("./DevDependencies")
    await deployer.deploy(Dependencies)

    // deploy libraries
    const BiMap = artifacts.require("@gnosis.pm/solidity-data-structures/contract/build/IdToAddressBiMap")
    await deployer.deploy(BiMap)

    const IterableAppendOnlySet = artifacts.require("@gnosis.pm/solidity-data-structures/contract/build/IterableAppendOnlySet")
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not in development, so nothing to do. Current network is %s", network)
  }
}

module.exports = migrate
