/* eslint-disable no-unused-vars */
/* eslint-disable indent */
const SnappBase = artifacts.require("SnappBase")

const zero_address = "0x0000000000000000000000000000000000000000"
const one_hash = "0x0000000000000000000000000000000000000001"

module.exports = async (callback) => {
    const instance = await SnappBase.deployed()
    const [accountId, tokenId, amount] = await process.argv.slice(4)

    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
        console.log("No account registerd at index %s", accountId)
        callback()
    }
    const tx = await instance.deposit(tokenId, amount, {from: depositor})
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index =  tx.logs[0].args.slotIndex.toNumber()

    const deposit_hash = (await instance.depositHashes(slot)).shaHash
    console.log("Deposit successful: Slot %s - Index %s - Hash %s", slot, slot_index, deposit_hash)
    callback()
}
