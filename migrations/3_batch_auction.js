/*eslint no-undef: "off"*/

const SnappBase = artifacts.require("./SnappBase.sol")
const Test = artifacts.require("./Test.sol")

module.exports = function(deployer) {
  deployer.deploy(SnappBase)
  .then( () => deployer.deploy(Test))
}