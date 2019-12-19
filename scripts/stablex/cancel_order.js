const BatchExchange = artifacts.require("BatchExchange")
const argv = require("yargs")
  .option("accountId", {
    describe: "Account index of the order placer",
  })
  .demand(["accountId", "orderIndex"])
  .help(false)
  .version(false).argv

module.exports = async callback => {
  try {
    const accounts = await web3.eth.getAccounts()
    const instance = await BatchExchange.deployed()
    await instance.cancelOrders([argv.orderIndex], { from: accounts[argv.accountId] })

    console.log(`Successfully cancelled order with ID ${argv.orderIndex}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
