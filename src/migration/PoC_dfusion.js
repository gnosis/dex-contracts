const { isDevelopmentNetwork, getDeployedDependency, getArtifact } = require("./utilities.js")
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
  const feeToken = await getDeployedDependency(
    artifacts,
    deployer,
    account,
    "@gnosis.pm/owl-token/build/contracts/TokenOWLProxy"
  )

  const BatchExchange = getArtifact(artifacts, deployer, account, "@gnosis.pm/dex-contracts/build/contracts/BatchExchange")
  const biMap = await getDeployedDependency(
    artifacts,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap"
  )
  const iterableAppendOnlySet = await getDeployedDependency(
    artifacts,
    deployer,
    account,
    "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet"
  )

  //linking libraries
  await deployer.link(biMap, BatchExchange)
  await deployer.link(iterableAppendOnlySet, BatchExchange)

  // eslint-disable-next-line no-console
  console.log("Deploy BatchExchange contract")
  await deployer.deploy(BatchExchange, maxTokens, feeToken.address)
}

module.exports = migrate
