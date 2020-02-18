const BatchExchange = artifacts.require("BatchExchange")
const BN = require("bn.js")
const readline = require("readline")

const { sendTxAndGetReturnValue, fetchTokenInfo } = require("../../test/utilities.js")

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const promptUser = function(message) {
  return new Promise(resolve => rl.question(message, answer => resolve(answer)))
}

const formatAmount = function(amount, token) {
  return new BN(10).pow(new BN(token.decimals)).muln(amount)
}

const argv = require("yargs")
  .option("tokens", {
    alias: "t",
    type: "string",
    describe: "Collection of trusted tokenIds",
    coerce: str => {
      return str.split(",").map(t => parseInt(t))
    },
  })
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("spread", {
    type: "float",
    describe: "Percentage increase required for trade (fees not accounted)",
    default: 0.25,
  })
  .option("sellAmount", {
    type: "int",
    describe: "Maximum sell amount (in full token units)",
    default: 1000,
  })
  .option("validFrom", {
    type: "int",
    describe: "Number of batches (from current) until order become valid",
    default: 3,
  })
  .option("expiry", {
    type: "int",
    describe: "Maximum auction batch for which these orders are valid",
    default: 2 ** 32 - 1,
  })
  .demand(["tokens", "accountId"])
  .help(
    "Make sure that you have an RPC connection to the network in consideration. For network configurations, please see truffle-config.js Example usage \n   npx truffle exec scripts/stablex/place_spread_orders.js --tokens=2,3,4 --accountId 0 --spread 0.3 --validFrom 5"
  )
  .version(false).argv

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    const accounts = await web3.eth.getAccounts()
    const account = accounts[argv.accountId]

    const batch_index = (await instance.getCurrentBatchId.call()).toNumber()
    const token_data = await fetchTokenInfo(instance, argv.tokens, artifacts)
    const expectedReturnFactor = 1 + argv.spread / 100
    const sellAmount = argv.sellAmount
    const buyAmount = sellAmount * expectedReturnFactor

    let buyTokens = []
    let sellTokens = []
    let buyAmounts = []
    let sellAmounts = []
    for (let i = 0; i < argv.tokens.length - 1; i++) {
      const tokenA = token_data[argv.tokens[i]]
      for (let j = i + 1; j < argv.tokens.length; j++) {
        const tokenB = token_data[argv.tokens[j]]

        buyTokens = buyTokens.concat(tokenA.id, tokenB.id)
        sellTokens = sellTokens.concat(tokenB.id, tokenA.id)
        buyAmounts = buyAmounts.concat(formatAmount(buyAmount, tokenA), formatAmount(buyAmount, tokenB))
        sellAmounts = sellAmounts.concat(formatAmount(sellAmount, tokenB), formatAmount(sellAmount, tokenA))
        console.log(`Sell ${sellAmounts.slice(-2)[0]} ${tokenB.symbol} for ${buyAmounts.slice(-2)[0]} ${tokenA.symbol}`)
        console.log(`Sell ${sellAmounts.slice(-2)[1]} ${tokenA.symbol} for ${buyAmounts.slice(-2)[1]} ${tokenB.symbol}`)
      }
    }

    const validFroms = Array(buyTokens.length).fill(batch_index + argv.validFrom)
    const validTos = Array(buyTokens.length).fill(argv.expiry)

    const answer = await promptUser("Are you sure you want to send this transaction to the EVM? [yN] ")
    if (answer == "y" || answer.toLowerCase() == "yes") {
      const ids = await sendTxAndGetReturnValue(
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
      console.log(`Successfully placed spread orders with IDs ${ids}`)
      console.log(`If this was undesired, these can be canceled as follows:\n
        npx truffle exec scripts/stablex/cancel_order.js --accountId ${argv.accountId} --orderIds ${ids}`)
    }

    callback()
  } catch (error) {
    callback(error)
  }
}
