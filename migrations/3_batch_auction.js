/*eslint no-undef: "off"*/

const BatchAuction = artifacts.require("./BatchAuction.sol")

module.exports = function(deployer) {
  deployer.deploy(BatchAuction)
}