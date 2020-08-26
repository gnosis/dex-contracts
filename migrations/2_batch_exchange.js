const migrateBatchExchange = require("../src/migration/PoC_dfusion")

module.exports = async function (deployer, network, accounts, web3) {
  return migrateBatchExchange({
    artifacts,
    deployer,
    network,
    account: accounts[0],
    web3,
    forceRedeploy: true,
    feeTokenAddress: process.env.FEE_TOKEN_ADDRESS,
  })
}
