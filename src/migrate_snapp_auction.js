const {getDependency} = require("./migration_utilities")

async function migrate({artifacts, network, deployer}) {
  const BiMap = getDependency(
    artifacts,
    network,
    deployer,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )
  const SnappBaseCore = artifacts.require("SnappBaseCore")
  const SnappAuction = artifacts.require("SnappAuction")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}

module.exports = migrate
