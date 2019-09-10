/*eslint no-undef: "off"*/

const BiMap = artifacts.require("IdToAddressBiMap.sol")
const SnappBaseCore = artifacts.require("SnappBaseCore.sol")
const SnappAuction = artifacts.require("SnappAuction.sol")

module.exports = async function (deployer) {
  await deployer.deploy(BiMap)

  await deployer.link(BiMap, SnappBaseCore)
  await deployer.deploy(SnappBaseCore)

  await deployer.link(BiMap, SnappAuction)
  await deployer.link(SnappBaseCore, SnappAuction)
  await deployer.deploy(SnappAuction)
}