const { isDevelopmentNetwork, getArtifactFromNpmImport, getArtifactFromBuildFolderOrImport } = require("./utilities.js")
const deployOwl = require("@gnosis.pm/owl-token/src/migrations-truffle-5/3_deploy_OWL")

async function migrate({ artifacts, deployer, network, account, web3, forceRedeploy, maxTokens = 2 ** 16 - 1 }) {
  let feeToken

  const BiMap = getArtifactFromNpmImport(
    "@gnosis.pm/solidity-data-structures/build/contracts/IdToAddressBiMap",
    deployer,
    account
  )
  const IterableAppendOnlySet = getArtifactFromNpmImport(
    "@gnosis.pm/solidity-data-structures/build/contracts/IterableAppendOnlySet",
    deployer,
    account
  )
  if (isDevelopmentNetwork(network)) {
    await deployOwl({
      artifacts,
      deployer,
      network,
      account,
      web3,
    })

    const TokenOWLProxy = artifacts.require("TokenOWLProxy")
    feeToken = await TokenOWLProxy.deployed()
    await deployer.deploy(BiMap)
    await deployer.deploy(IterableAppendOnlySet)
  } else {
    const TokenOWLProxy = getArtifactFromNpmImport("@gnosis.pm/owl-token/build/contracts/TokenOWLProxy", deployer, account)
    feeToken = await TokenOWLProxy.deployed()
    await BiMap.deployed()
    await IterableAppendOnlySet.deployed()
  }

  const BatchExchange = getArtifactFromBuildFolderOrImport(
    artifacts,
    network,
    deployer,
    account,
    "@gnosis.pm/dex-contracts/build/contracts/BatchExchange.json"
  )

  // When external projects depend on us we don't want to redeploy e.g. on Rinkeby/Mainnet
  if (!BatchExchange.isDeployed() || forceRedeploy) {
    //linking libraries
    await deployer.link(BiMap, BatchExchange)
    await deployer.link(IterableAppendOnlySet, BatchExchange)

    // eslint-disable-next-line no-console
    console.log("Deploy BatchExchange contract")
    await deployer.deploy(BatchExchange, maxTokens, feeToken.address)
  }

  return BatchExchange
}

module.exports = migrate
