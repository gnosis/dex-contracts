const BatchExchange = artifacts.require("BatchExchange")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .option("orderIds", {
    type: "array",
    describe: "Order IDs to be canceled",
    coerce: array => {
      try {
        return array.flatMap(v => v.split(",").map(o => parseInt(o)))
      } catch (TypeError) {
        console.log(`Detected individual order cancelation ${array[0]}`)
        return array
      }
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
