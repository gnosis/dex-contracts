const StablecoinConverter = artifacts.require("StablecoinConverter")
const { depositTokens } = require("../script_utilities.js")
const argv = require("yargs")
  .option("accountId", {
    describe: "Depositor's account index"
  })
  .option("tokenId", {
    describe: "Token to deposit"
  })
  .option("amount", {
    describe: "Amount in to deposit (in 10**18 WEI, e.g. 1 = 1 ETH)"
  })
  .demand(["accountId", "tokenId", "amount"])
  .help(false)
  .version(false)
  .argv

const zero_address = 0x0

module.exports = async (callback) => {
  try {
    const amount = web3.utils.toWei(String(argv.amount))
    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const depositor = await accounts[argv.accountId]

    const token_address = await instance.tokenIdToAddressMap.call(argv.tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`)
    }
    await depositTokens(token_address, depositor, amount, artifacts)
    const tradeable_at = await instance.getPendingDepositBatchNumber(depositor, token_address)

    console.log(`Deposit successful. Can be traded as of batch ${tradeable_at}`)
    callback()
  } catch (error) {
    callback(error)
  }
}