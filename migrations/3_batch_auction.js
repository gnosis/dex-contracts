/*eslint no-undef: "off"*/

const SnappAuction = artifacts.require("./SnappAuction.sol")

module.exports = function(deployer) {
  deployer.deploy(SnappAuction)
}