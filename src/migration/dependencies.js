const { isDevelopmentNetwork, getDependency } = require("./utilities.js")

async function migrate({ artifacts, deployer, network, accounts }) {
  if (isDevelopmentNetwork(network)) {
    // deploy libraries
    const BiMap = getDependency(
      artifacts,
      network,
      deployer,
      accounts,
      "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
    )
    await deployer.deploy(BiMap)

    const IterableAppendOnlySet = getDependency(
      artifacts,
      network,
      deployer,
      accounts,
      "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet"
    )
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not in development, so nothing to do. Current network is %s", network)
  }
}

module.exports = migrate
