const { addTokens } = require("./utilities.js")
const fetch = require("node-fetch")

module.exports = async function (callback) {
  try {
    const token_list = await (await fetch("https://raw.githubusercontent.com/gnosis/dex-react/develop/src/api/tokenList/tokenList.json")).json()
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