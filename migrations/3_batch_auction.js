/*eslint no-undef: "off"*/

const BiMap = artifacts.require("IdToAddressBiMap.sol")
const SnappAuction = artifacts.require("./SnappAuction.sol")

module.exports = async function (deployer) {
  await deployer.deploy(BiMap)
  await deployer.link(BiMap, SnappAuction)
  await deployer.deploy(SnappAuction)
}