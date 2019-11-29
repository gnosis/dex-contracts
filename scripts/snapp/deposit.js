const SnappAuction = artifacts.require("SnappAuction")
const ERC20 = artifacts.require("ERC20")
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
  .version(false).argv

const zero_address = 0x0

module.exports = async callback => {
  try {
    const amount = web3.utils.toWei(String(argv.amount))

    const instance = await SnappAuction.deployed()
    const depositor = await instance.accountToPublicKeyMap.call(argv.accountId)
    if (depositor == zero_address) {
      callback(`Error: No account registerd at index ${argv.accountId}`)
    }

    const token_address = await instance.tokenIdToAddressMap.call(argv.tokenId)
    if (token_address == zero_address) {
      callback(`Error: No token registered at index ${argv.tokenId}`)
    }

    const token = await ERC20.at(token_address)
    const depositor_balance = await token.balanceOf.call(depositor)
    if (depositor_balance.lt(amount)) {
      callback(`Error: Depositor has insufficient balance ${depositor_balance} < ${amount}.`)
    }

    const tx = await instance.deposit(argv.tokenId, amount, { from: depositor })
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()

    const deposit_hash = await instance.getDepositHash(slot)
    console.log("Deposit successful: Slot %s - Index %s - Hash %s", slot, slot_index, deposit_hash)
    callback()
  } catch (error) {
    callback(error)
  }
}
