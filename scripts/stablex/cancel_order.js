const BatchExchange = artifacts.require("BatchExchange")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("orderIds", {
    type: "string",
    describe: "Order IDs to be canceled",
    coerce: str => {
      return str.split(",").map(o => parseInt(o))
    },
  })
  .demand(["accountId", "orderIds"])
  .help(false)
  .version(false).argv

module.exports = async callback => {
  try {
    const accounts = await web3.eth.getAccounts()
    const instance = await BatchExchange.deployed()
    await instance.cancelOrders(argv.orderIds, { from: accounts[argv.accountId] })

    console.log(`Successfully cancelled order with ID ${argv.orderIds}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
