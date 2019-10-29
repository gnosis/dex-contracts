const { isDevelopmentNetwork, getDependency } = require("../migration_utilities.js")

async function migrate({
  artifacts,
  deployer,
  network,
  feeDenominator = 1000,
  maxTokens = 2 ** 16 - 1
}) {
  let fee_token
  if (isDevelopmentNetwork(network)) {
    const ERC20Mintable = artifacts.require("ERC20Mintable")
    await deployer.deploy(ERC20Mintable)
    fee_token = await ERC20Mintable.deployed()
  } else {
    const TokenOWLProxy = getDependency(artifacts, network, deployer, "@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
    fee_token = await TokenOWLProxy.deployed()
  }
  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const BiMap = getDependency(artifacts, network, deployer, "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap")
  const IterableAppendOnlySet = getDependency(artifacts, network, deployer, "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet")

  //linking libraries
  await deployer.link(BiMap, StablecoinConverter)
  await deployer.link(IterableAppendOnlySet, StablecoinConverter)

  // eslint-disable-next-line no-console
  console.log("Deploy StablecoinConverter contract")
  await deployer.deploy(StablecoinConverter, maxTokens, feeDenominator, fee_token.address)
}

module.exports = migrate