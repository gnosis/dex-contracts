const { getDependency } = require("./utilities")

async function migrate({ artifacts, network, deployer, accounts }) {
  const BiMap = getDependency(
    artifacts,
    network,
    deployer,
    accounts,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )

  // Hack to populate truffle artifact values correctly for linked libraries.
  await BiMap.deployed()

  const SnappBaseCore = artifacts.require("SnappBaseCore")
  const SnappAuction = artifacts.require("SnappAuction")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}

module.exports = migrate
