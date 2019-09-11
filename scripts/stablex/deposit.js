const StablecoinConverter = artifacts.require("StablecoinConverter")
const ERC20 = artifacts.require("ERC20.sol")
const argv = require("yargs").argv

const zero_address = 0x0

module.exports = async (callback) => {
  try {
    if (!argv.accountId || !argv.tokenId || !argv.amount) {
      callback("Error: This script requires arguments: --accountId, --tokenId, --amount")
    }
    const amount = new web3.utils.BN(web3.utils.toWei(argv.amount))

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const depositor = await accounts[argv.accountId]

    const token_address = await instance.tokenIdToAddressMap.call(argv.tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`)
    }

    const token = await ERC20.at(token_address)
    const depositor_balance = (await token.balanceOf.call(depositor))
    if (depositor_balance.lt(amount)) {
      callback(`Error: Depositor has insufficient balance ${depositor_balance} < ${amount}.`)
    }

    await instance.deposit(token_address, amount, { from: depositor })
    const tradeable_at = await instance.getPendingDepositBatchNumber(depositor, token_address)

    console.log(`Deposit successful. Can be traded as of batch ${tradeable_at}`)
    callback()
  } catch (error) {
    callback(error)
  }
}