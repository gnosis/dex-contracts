/*eslint no-undef: "off"*/

const BiMap = artifacts.require("IdToAddressBiMap.sol")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet.sol")
const StablecoinConverter = artifacts.require("StablecoinConverter.sol")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")

module.exports = async function (deployer, network) {
  let fee_token
  if (network == "development" || network == "coverage") {
    await deployer.deploy(ERC20Mintable)
    fee_token = await ERC20Mintable.deployed()
  } else {
    throw (`No migration found for network "${network}"`)
  }

  await deployer.deploy(BiMap)
  await deployer.deploy(IterableAppendOnlySet)

  await deployer.link(BiMap, StablecoinConverter)
  await deployer.link(IterableAppendOnlySet, StablecoinConverter)
  await deployer.deploy(StablecoinConverter, 2 ** 16 - 1, 1000, fee_token.address)
}