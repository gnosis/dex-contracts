/*eslint no-undef: "off"*/

const Dependencies = artifacts.require("./DevDependencies.sol")

module.exports = function(deployer) {
  deployer.deploy(Dependencies)
}