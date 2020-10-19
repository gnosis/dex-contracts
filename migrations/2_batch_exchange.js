const migrateBatchExchange = require("../src/migration/migrate_BatchExchange")
const { getArtifactFromBuildFolderOrImport } = require("../src/migration/utilities")

module.exports = async function (deployer, network, accounts, web3) {
  const BatchExchange = getArtifactFromBuildFolderOrImport(
    artifacts,
    deployer,
    accounts[0],
    "@gnosis.pm/dex-contracts/build/contracts/BatchExchange"
  )
  return migrateBatchExchange({
    BatchExchange,
    artifacts,
    deployer,
    network,
    account: accounts[0],
    web3,
    forceRedeploy: true,
    feeTokenAddress: process.env.FEE_TOKEN_ADDRESS,
  })
}
