const SnappAuction = artifacts.require("SnappAuction")
const getArgumentsHelper = require("./script_utilities.js")

module.exports = async (callback) => {
  try {
    const arguments = getArgumentsHelper()
    if (arguments.length != 5) {
      callback("Error: This script requires arguments - <accountId> <buyToken> <sellToken> <minBuy> <maxSell>")
    }
    const [accountId, buyToken, sellToken, minBuy_arg, maxSell_arg] = arguments
    const minBuy = web3.utils.toWei(minBuy_arg)
    const maxSell = web3.utils.toWei(maxSell_arg)
    
    const instance = await SnappAuction.deployed()
    const sender = await instance.accountToPublicKeyMap.call(accountId)
    if (sender == 0x0) {
      callback(`Error: No account registerd at index ${accountId}`)
    }
  
    const buyTokenAddress = await instance.tokenIdToAddressMap.call(buyToken)
    if (buyTokenAddress == 0x0) {
      callback(`Error: No token registered at index ${buyToken}`)
    }

    const sellTokenAddress = await instance.tokenIdToAddressMap.call(sellToken)
    if (sellTokenAddress == 0x0) {
      callback(`Error: No token registered at index ${sellToken}`)
    }
  
    const tx = await instance.placeSellOrder(buyToken, sellToken, minBuy, maxSell, { from: sender })
    const slot = tx.logs[0].args.auctionId.toNumber()
    const slot_index = tx.logs[0].args.slotIndex.toNumber()
  
    const withdraw_hash = (await instance.auctions(slot)).shaHash
    console.log("Limit Sell Order successful: Auction %s - Index %s - Hash %s", slot, slot_index, withdraw_hash)
    callback()
  } catch(error) {
    callback(error)
  }
}