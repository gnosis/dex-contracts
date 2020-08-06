const { isDevelopmentNetwork, getArtifactFromNpmImport } = require("./utilities.js")
const deployOwl = require("@gnosis.pm/owl-token/src/migrations-truffle-5/3_deploy_OWL")

async function migrate({ artifacts, deployer, network, account, web3, maxTokens = 2 ** 16 - 1 }) {
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

  const BatchExchange = artifacts.require("BatchExchange")
  //linking libraries
  await deployer.link(BiMap, BatchExchange)
  await deployer.link(IterableAppendOnlySet, BatchExchange)

  // eslint-disable-next-line no-console
  console.log("Deploy BatchExchange contract")
  await deployer.deploy(BatchExchange, maxTokens, feeToken.address)
}

module.exports = migrate
