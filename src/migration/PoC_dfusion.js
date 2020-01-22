const { isDevelopmentNetwork, getDependency } = require("./utilities.js")
const deployOwl = require("@gnosis.pm/owl-token/src/migrations-truffle-5/3_deploy_OWL")

async function migrate({ artifacts, deployer, network, account, web3, maxTokens = 2 ** 16 - 1 }) {
  if (isDevelopmentNetwork(network)) {
    await deployOwl({
      artifacts,
      deployer,
      network,
      account,
      web3,
    })
  }
  const TokenOWLProxy = getDependency(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/owl-token/build/contracts/TokenOWLProxy"
  )
  const fee_token = await TokenOWLProxy.deployed()

  const BatchExchange = getDependency(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/dex-contracts/build/contracts/BatchExchange"
  )
  const BiMap = getDependency(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )
  const IterableAppendOnlySet = getDependency(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet"
  )

  // Hack to populate truffle artifact data correctly for linked libraries.
  await BiMap.deployed()
  await IterableAppendOnlySet.deployed()

  //linking libraries
  await deployer.link(BiMap, BatchExchange)
  await deployer.link(IterableAppendOnlySet, BatchExchange)

  // eslint-disable-next-line no-console
  console.log("Deploy BatchExchange contract")
  await deployer.deploy(BatchExchange, maxTokens, fee_token.address)
}

module.exports = migrate
