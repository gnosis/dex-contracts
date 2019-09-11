const StablecoinConverter = artifacts.require("StablecoinConverter")
const ERC20 = artifacts.require("ERC20.sol")
const { getArgumentsHelper } = require("../script_utilities.js")

const zero_address = 0x0

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 3) {
      callback("Error: This script requires arguments - <accountId> <tokenId> <depositAmount>")
    }
    const [accountId, tokenId, amount_arg] = arguments
    const amount = new web3.utils.BN(web3.utils.toWei(amount_arg))

    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    const depositor = await accounts[accountId]

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${tokenId}`)
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