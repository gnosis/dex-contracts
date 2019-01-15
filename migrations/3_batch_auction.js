/*eslint no-undef: "off"*/

const SnappBase = artifacts.require("./SnappBase.sol")

module.exports = function(deployer) {
  deployer.deploy(SnappBase)
}