/*eslint no-undef: "off"*/

const BatchAuction = artifacts.require("./BatchAuction.sol")

module.exports = function(deployer, networks, accounts) {
  deployer.deploy(BatchAuction)
}