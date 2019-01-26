/* eslint-disable no-unused-vars */
/* eslint-disable indent */
const SnappBase = artifacts.require("SnappBase")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")

const zero_address = "0x0000000000000000000000000000000000000000"

module.exports = async (callback) => {
    const instance = await SnappBase.deployed()
    const [accountId, tokenId, amount] = await process.argv.slice(4)

    const depositor = await instance.accountToPublicKeyMap.call(accountId)
    if (depositor == zero_address) {
        console.log("No account registerd at index %s", accountId)
        callback()
    }

    const token_address = await instance.tokenIdToAddressMap.call(tokenId)
    if (token_address == zero_address) {
        console.log("No token registered at index %s", tokenId)
        callback()
    }

    const token = await ERC20Mintable.at(token_address)
    const depositor_balance = (await token.balanceOf.call(depositor)).toNumber()
    if (depositor_balance < amount) {
        console.log("Depositor has insufficient balance, will not submit deposit request.")
        callback()
    }

    const tx = await instance.deposit(tokenId, amount, {from: depositor})
    const slot = tx.logs[0].args.slot.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()

    const deposit_hash = (await instance.deposits(slot)).shaHash
    console.log("Deposit successful: Slot %s - Index %s - Hash %s", slot, slot_index, deposit_hash)
    callback()
}
