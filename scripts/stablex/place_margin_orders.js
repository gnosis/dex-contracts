const BatchExchange = artifacts.require("BatchExchange")
const { sendTxAndGetReturnValue } = require("../../test/utilities.js")
const BN = require("bn.js")

const argv = require("yargs")
  .option("tokens", {
    describe: "Collection of trusted tokens",
  })
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("margin", {
    type: "float",
    describe: "Percentage increase required for trade (fees not accounted)",
    default: 0.2,
  })
  .option("sellAmount", {
    type: "float",
    describe: "Maximum sell amount (considered infinite if empty)",
    default: 100,
  })
  .option("expiry", {
    type: "int",
    describe: "Maximum auction batch for which these orders are valid",
    default: 2 ** 32 - 1,
  })
  .demand(["tokens", "accountId"])
  .help(false)
  .version(false).argv

// TODO - automate this with tokenIdToAddress dot decimals
const TOKEN_DECMIALS = {
  2: 6,
  3: 18,
  4: 6,
  5: 18,
  6: 2,
  7: 18,
}

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    const accounts = await web3.eth.getAccounts()
    const account = accounts[argv.accountId]

    const batch_index = (await instance.getCurrentBatchId.call()).toNumber()

    const trusted_tokens = argv.tokens.split(",").map(t => parseInt(t))
    const expectedReturnFactor = 1 + argv.margin / 100
    const sellAmount = argv.sellAmount
    const buyAmount = sellAmount * expectedReturnFactor

    let buyTokens = []
    let sellTokens = []
    let buyAmounts = []
    let sellAmounts = []
    for (let i = 0; i < trusted_tokens.length - 1; i++) {
      const tokenA = trusted_tokens[i]
      const tokenScaleA = new BN(10).pow(new BN(TOKEN_DECMIALS[tokenA]))
      for (let j = i + 1; j < trusted_tokens.length; j++) {
        const tokenB = trusted_tokens[j]
        const tokenScaleB = new BN(10).pow(new BN(TOKEN_DECMIALS[tokenB]))
        buyTokens = buyTokens.concat([tokenA, tokenB])
        sellTokens = sellTokens.concat([tokenB, tokenA])
        buyAmounts = buyAmounts.concat(tokenScaleA.muln(buyAmount), tokenScaleB.muln(buyAmount))
        sellAmounts = sellAmounts.concat(tokenScaleA.muln(sellAmount), tokenScaleB.muln(sellAmount))
      }
    }

    // Allowing user 2 batches (10 minutes) to cancel if it is incorrectly placed
    const validFroms = Array(buyTokens.length).fill(batch_index + 2)
    const validTos = Array(buyTokens.length).fill(argv.expiry)

    const id = await sendTxAndGetReturnValue(
      instance.placeValidFromOrders,
      buyTokens,
      sellTokens,
      validFroms,
      validTos,
      buyAmounts,
      sellAmounts,
      {
        from: account,
      }
    )
    console.log(`Successfully placed margin orders with IDs ${id}`)

    callback()
  } catch (error) {
    callback(error)
  }
}
