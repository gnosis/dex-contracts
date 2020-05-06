const { addTokens, getBatchExchange, getOwl } = require("./utilities.js");
const argv = require("yargs")
  .option("tokenAddress", {
    describe: "Address of the token to be added",
  })
  .demand(["tokenAddress"])
  .help(false)
  .version(false).argv;

module.exports = async function (callback) {
  try {
    const [account] = await web3.eth.getAccounts();
    const batchExchange = await getBatchExchange(artifacts);
    const owl = await getOwl(artifacts);
    await addTokens({
      tokenAddresses: [argv.tokenAddress],
      account,
      batchExchange,
      owl,
    });
    callback();
  } catch (error) {
    callback(error);
  }
};
