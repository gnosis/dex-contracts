const { addTokens, getBatchExchange, getOwl, token_list_url } = require("./utilities.js")
const fetch = require("node-fetch")
const argv = require("yargs")
  .option("token_list_url", {
    describe: "A url which can be fetched with node-fetch",
    default: token_list_url,
  })
  .help(false)
  .version(false).argv

module.exports = async function(callback) {
  try {
    const tokenList = await (await fetch(argv.token_list_url)).json()
    const networkId = String(await web3.eth.net.getId())

    const tokenAddresses = []
    for (const token in tokenList) {
      const network_address_map = new Map(Object.entries(tokenList[token].addressByNetwork))
      const tokenAddress = network_address_map.get(networkId)
      tokenAddresses.push(tokenAddress)
    }
    const [account] = await web3.eth.getAccounts()
    const batchExchange = await getBatchExchange(artifacts)
    const owl = await getOwl(artifacts)

    await addTokens({ tokenAddresses, account, batchExchange, owl })

    callback()
  } catch (error) {
    callback(error)
  }
}
