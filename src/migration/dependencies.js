const { isDevelopmentNetwork, artifactFromNpmImport } = require("./utilities.js")

async function migrate({ deployer, network, account }) {
  if (isDevelopmentNetwork(network)) {
    const BiMap = artifactFromNpmImport(
      "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap",
      deployer,
      account
    )
    const IterableAppendOnlySet = artifactFromNpmImport(
      "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet",
      deployer,
      account
    )
    await deployer.deploy(BiMap)
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    // eslint-disable-next-line no-console
    console.log("Not in development, so nothing to do. Current network is %s", network)
  }
}

module.exports = migrate
