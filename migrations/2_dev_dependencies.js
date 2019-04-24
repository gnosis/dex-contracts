/*eslint no-undef: "off"*/

const Dependencies = artifacts.require("./DevDependencies.sol")
const BiMap = artifacts.require("BiMap.sol")
const BiMapWrapper = artifacts.require("BiMapWrapper.sol")

module.exports = function(deployer) {
  deployer.deploy(Dependencies)

  deployer.deploy(BiMap).then(() => {
    deployer.deploy(BiMapWrapper)
  })
  deployer.link(BiMap, BiMapWrapper)
}