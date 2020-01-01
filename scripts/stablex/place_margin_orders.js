const BatchExchange = artifacts.require("BatchExchange")
const ERC20 = artifacts.require("ERC20")
const fetch = require("node-fetch")
const BN = require("bn.js")
const { sendTxAndGetReturnValue } = require("../../test/utilities.js")

const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

const fetchTokenInfo = async function(contract, tokenIds) {
  console.log(`Recovering token data from URL ${token_list_url}`)
  const token_list = await (await fetch(token_list_url)).json()
  const token_data = {}
  for (const token of token_list) {
    token_data[token.id] = token
  }

  // console.log("Recovering token data from EVM")
  // const tokenObjects = []
  // for (const id of tokenIds) {
  //   const tokenAddress = await contract.tokenIdToAddressMap(id)
  //   const tokenInstance = await ERC20.at(tokenAddress)
  //   console.log(await tokenInstance.decimals)
  //   tokenObjects.push(await ERC20.at(tokenAddress))
  // }
  return token_data
}

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
    default: 0.25,
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
  .help("Make sure that you have an RPC connection to the network in consideration")
  .version(false).argv

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    const accounts = await web3.eth.getAccounts()
    const account = accounts[argv.accountId]

    const batch_index = (await instance.getCurrentBatchId.call()).toNumber()

    const trusted_tokens = argv.tokens.split(",").map(t => parseInt(t))
    const token_data = await fetchTokenInfo(instance, trusted_tokens)

    const expectedReturnFactor = 1 + argv.margin / 100
    const sellAmount = argv.sellAmount
    const buyAmount = sellAmount * expectedReturnFactor

    let buyTokens = []
    let sellTokens = []
    let buyAmounts = []
    let sellAmounts = []
    for (let i = 0; i < trusted_tokens.length - 1; i++) {
      const tokenA = trusted_tokens[i]
      const tokenScaleA = new BN(10).pow(new BN(token_data[tokenA].decimals))
      for (let j = i + 1; j < trusted_tokens.length; j++) {
        const tokenB = trusted_tokens[j]
        const tokenScaleB = new BN(10).pow(new BN(token_data[tokenB].decimals))
        buyTokens = buyTokens.concat(tokenA, tokenB)
        sellTokens = sellTokens.concat(tokenB, tokenA)
        buyAmounts = buyAmounts.concat(tokenScaleA.muln(buyAmount), tokenScaleB.muln(buyAmount))
        sellAmounts = sellAmounts.concat(tokenScaleB.muln(sellAmount), tokenScaleA.muln(sellAmount))
        console.log(
          `Selling ${sellAmounts[sellAmounts.length - 2]} ${token_data[tokenB].name} for ${buyAmounts[buyAmounts.length - 2]} ${
            token_data[tokenA].name
          }`
        )
        console.log(
          `Selling ${sellAmounts[sellAmounts.length - 1]} ${token_data[tokenA].name} for ${buyAmounts[buyAmounts.length - 1]} ${
            token_data[tokenB].name
          }`
        )
      }
    }

    // Allowing user 3 batches (15 minutes) to cancel if it is incorrectly placed
    const validFroms = Array(buyTokens.length).fill(batch_index + 3)
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
