const { addTokens } = require("../script_utilities.js")
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
    await addTokens([argv.tokenAddress], web3, artifacts)
    callback()
  } catch (error) {
    callback(error)
  }
}
