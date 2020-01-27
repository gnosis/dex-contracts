const { getDeployedDependency } = require("./utilities")

async function migrate({ artifacts, deployer, account }) {
  const biMap = await getDeployedDependency(
    artifacts,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )

  const SnappBaseCore = artifacts.require("SnappBaseCore")
  const SnappBase = artifacts.require("SnappBase")
  const SnappAuction = artifacts.require("SnappAuction")

  await deployer.link(biMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)
  await deployer.link(biMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.link(SnappBaseCore, SnappBase)

  await deployer.deploy(SnappAuction)
}

module.exports = migrate
