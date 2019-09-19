const { getDependency } = require("../migration_utilities.js")

async function migrate({
  artifacts,
  network,
  deployer
}) {
  const BiMap = getDependency(artifacts, network, deployer, "BiMap", "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap")
  const SnappBaseCore = artifacts.require("SnappBaseCore.sol")
  const SnappAuction = artifacts.require("SnappAuction.sol")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}

module.exports = migrate