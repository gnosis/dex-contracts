const { isDevelopmentNetwork, artifactFromNpmImport, getDependency } = require("./utilities.js")
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
  const BiMap = artifactFromNpmImport("@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap", deployer, account)
  const biMap = await BiMap.deployed()
  biMap.contract_name = "IdToAddressBiMap"
  biMap.isDeployed = function() {
    return true
  }
  const IterableAppendOnlySet = artifactFromNpmImport(
    "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet",
    deployer,
    account
  )
  const iterableAppendOnlySet = await IterableAppendOnlySet.deployed()
  iterableAppendOnlySet.contract_name = "IterableAppendOnlySet"
  iterableAppendOnlySet.isDeployed = function() {
    return true
  }
  //linking libraries
  await deployer.link(biMap, BatchExchange)
  await deployer.link(iterableAppendOnlySet, BatchExchange)

  // eslint-disable-next-line no-console
  console.log("Deploy BatchExchange contract")
  await deployer.deploy(BatchExchange, maxTokens, fee_token.address)
}

module.exports = migrate
