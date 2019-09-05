/*eslint no-undef: "off"*/

const BiMap = artifacts.require("IdToAddressBiMap.sol")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet.sol")
const SnappBaseCore = artifacts.require("SnappBaseCore.sol")
const SnappAuction = artifacts.require("SnappAuction.sol")

module.exports = async function (deployer) {
  await deployer.deploy(BiMap)
  await deployer.deploy(IterableAppendOnlySet)

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.link(IterableAppendOnlySet, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}