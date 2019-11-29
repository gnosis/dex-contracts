const { isDevelopmentNetwork, getDependency } = require("./migration_utilities.js")
const deployOwl = require("@gnosis.pm/owl-token/src/migrations-truffle-5/3_deploy_OWL")

async function migrate({ artifacts, deployer, network, accounts, web3, feeDenominator = 1000, maxTokens = 2 ** 16 - 1 }) {
  let fee_token
  if (isDevelopmentNetwork(network)) {
    await deployOwl({
      artifacts,
      deployer,
      network,
      accounts,
      web3,
    })
    const TokenOWLProxy = artifacts.require("TokenOWLProxy")
    fee_token = await TokenOWLProxy.deployed()
  } else {
    const TokenOWLProxy = getDependency(artifacts, network, deployer, "@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
    fee_token = await TokenOWLProxy.deployed()
  }
  const BatchExchange = artifacts.require("BatchExchange")
  const BiMap = getDependency(
    artifacts,
    network,
    deployer,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )
  const IterableAppendOnlySet = getDependency(
    artifacts,
    network,
    deployer,
    "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet"
  )

  //linking libraries
  await deployer.link(BiMap, BatchExchange)
  await deployer.link(IterableAppendOnlySet, BatchExchange)

  // eslint-disable-next-line no-console
  console.log("Deploy BatchExchange contract")
  await deployer.deploy(BatchExchange, maxTokens, feeDenominator, fee_token.address)
}

module.exports = migrate
