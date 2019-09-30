const StablecoinConverter = artifacts.require("StablecoinConverter")
const argv = require("yargs")
  .option("tokenAddress", {
    describe: "Address of the token to be added"
  })
  .demand(["tokenAddress"])
  .help(false)
  .version(false)
  .argv

module.exports = async function (callback) {
  try {
    const token_address = argv.tokenAddress.toString()

    const instance = await StablecoinConverter.deployed()

    await instance.addToken(token_address)

    console.log(`Successfully added token ${token_address}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
