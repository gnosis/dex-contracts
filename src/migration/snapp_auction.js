const { getArtifactFromNpmImport, isDevelopmentNetwork } = require("./utilities")

async function migrate({ artifacts, network, deployer, account }) {
  const BiMap = getArtifactFromNpmImport(
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap",
    deployer,
    account
  )
  if (isDevelopmentNetwork(network)) {
    await deployer.deploy(BiMap)
  } else {
    await BiMap.deployed()
  }

  const SnappBaseCore = artifacts.require("SnappBaseCore")
  const SnappAuction = artifacts.require("SnappAuction")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}

module.exports = migrate
