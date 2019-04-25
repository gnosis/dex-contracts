/*eslint no-undef: "off"*/

const BiMap = artifacts.require("IdToAddressBiMap.sol")
const SnappAuction = artifacts.require("./SnappAuction.sol")

module.exports = function (deployer) {
  deployer.deploy(BiMap).then(() => {
    deployer.link(BiMap, SnappAuction).then(() => {
      deployer.deploy(SnappAuction)
    })
  })
}