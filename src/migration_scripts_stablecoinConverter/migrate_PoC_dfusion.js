const FEE_DENOMINATOR = 1000 // 0.1% fee
const MAX_TOKENS = 2 ** 16 - 1

async function migrate({
  artifacts,
  deployer,
  network,
  feeDenominator = FEE_DENOMINATOR,
  maxTokens = MAX_TOKENS
}) {
  const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
  let fee_token
  if (network == "development" || network == "coverage") {
    await deployer.deploy(ERC20Mintable)
    fee_token = await ERC20Mintable.deployed()
  } else {
    const TokenGNO = artifacts.require("@gnosis.pm/gno-token/build/TokenGNO.json")
    fee_token = await TokenGNO.deployed()
  }
  const StablecoinConverter = artifacts.require("StablecoinConverter")
  const BiMap = artifacts.require("IdToAddressBiMap.sol")
  const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet.sol")
  //linking libraries
  await deployer.link(BiMap, StablecoinConverter)
  await deployer.link(IterableAppendOnlySet, StablecoinConverter)

  // eslint-disable-next-line no-console
  console.log("Deploy StablecoinConverter contract")
  await deployer.deploy(StablecoinConverter, maxTokens, feeDenominator, fee_token.address)
}

module.exports = migrate