const { addTokens, token_list_url } = require("./utilities.js")
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
    const token_list = await (await fetch(argv.token_list_url)).json()
    const network_id = String(await web3.eth.net.getId())

    const addresses = []
    for (const token in token_list) {
      const network_address_map = new Map(Object.entries(token_list[token].addressByNetwork))
      const token_address = network_address_map.get(network_id)
      addresses.push(token_address)
    }
    await addTokens(addresses, web3, artifacts)

    callback()
  } catch (error) {
    callback(error)
  }
}
