const { addTokens } = require("./utilities.js")
const fetch = require("node-fetch")

module.exports = async function (callback) {
  try {
    //TODO(fleupold) use master branch here
    const token_list = await (await fetch("https://raw.githubusercontent.com/gnosis/dex-react/899f14e43814446dc96e5696b85d38e639d81fdc/src/api/tokenList/tokenList.json")).json()
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