const migrateBatchExchange = require("../src/migration/migrate_BatchExchange")
const BatchExchange = artifacts.require("../build/contracts/BatchExchange")

module.exports = async function (deployer, network, accounts, web3) {
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
