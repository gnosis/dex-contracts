async function migrate({
  artifacts,
  deployer
}) {
  const BiMap = artifacts.require("@gnosis.pm/solidity-data-structures/contract/build/IdToAddressBiMap")
  const SnappBaseCore = artifacts.require("SnappBaseCore.sol")
  const SnappAuction = artifacts.require("SnappAuction.sol")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}

module.exports = migrate