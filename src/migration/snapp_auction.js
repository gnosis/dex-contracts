const { getDependency } = require("./utilities")

async function migrate({ artifacts, network, deployer, account }) {
  const BiMap = await getDependency(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )

  // Hack to populate truffle artifact values correctly for linked libraries.
  await BiMap.deployed()

  const SnappBaseCore = artifacts.require("SnappBaseCore")
  const SnappBase = artifacts.require("SnappBase")
  const SnappAuction = artifacts.require("SnappAuction")

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.link(SnappBaseCore, SnappBase)

  await deployer.deploy(SnappAuction)
}

module.exports = migrate
