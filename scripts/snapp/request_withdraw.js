const SnappAuction = artifacts.require("SnappAuction")
const zero_address = 0x0
const argv = require("yargs")
  .option("accountId", {
    describe: "Withdrawers's account index",
  })
  .option("tokenId", {
    describe: "Token to withdraw",
  })
  .option("amount", {
    describe: "Amount in to withdraw (in 10**18 WEI, e.g. 1 = 1 ETH)",
  })
  .demand(["accountId", "tokenId", "amount"])
  .help(false)
  .version(false).argv

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

    const tx = await instance.requestWithdrawal(argv.tokenId, amount, { from: depositor })
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()

    const withdraw_hash = await instance.getWithdrawHash(slot)
    console.log("Withdraw Request successful: Slot %s - Index %s - Hash %s", slot, slot_index, withdraw_hash)
    callback()
  } catch (error) {
    callback(error)
  }
}
