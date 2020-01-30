const { getArtifactFromNpmImport, isDevelopmentNetwork } = require("./utilities")

async function migrate({ artifacts, network, deployer, account }) {
  let BiMap
  if (isDevelopmentNetwork(network)) {
    BiMap = artifacts.require("IdToAddressBiMap")
    await deployer.deploy(BiMap)
  } else {
    BiMap = getArtifactFromNpmImport("@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap", deployer, account)
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
