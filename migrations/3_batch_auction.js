/*eslint no-undef: "off"*/

// const SnappAuction = artifacts.require("./SnappAuction.sol")

// module.exports = function(deployer) {
//   deployer.deploy(SnappAuction)
// }


const BiMap = artifacts.require("BiMap.sol")
const SnappAuction = artifacts.require("./SnappAuction.sol")

module.exports = function (deployer) {
  deployer.deploy(BiMap).then(() => {
    deployer.deploy(SnappAuction)
  })
  deployer.link(BiMap, SnappAuction)
}