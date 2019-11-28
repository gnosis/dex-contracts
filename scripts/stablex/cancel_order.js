const StablecoinConverter = artifacts.require("StablecoinConverter")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer"
  })
  .demand(["accountId", "orderId"])
  .help(false)
  .version(false).argv

module.exports = async callback => {
  try {
    const accounts = await web3.eth.getAccounts()
    const instance = await StablecoinConverter.deployed()
    await instance.cancelOrders([argv.orderId], {from: accounts[argv.accountId]})

    console.log(`Successfully cancelled order with ID ${argv.orderId}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
