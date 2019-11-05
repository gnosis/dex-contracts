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
    const accounts = await web3.eth.getAccounts()

    const token_address = argv.tokenAddress.toString()
    const StablecoinConverter = artifacts.require("StablecoinConverter")
    const instance = await StablecoinConverter.deployed()

    const TokenOWL = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWL")
    const TokenOWLProxy = artifacts.require("../node_modules/@gnosis.pm/owl-token/build/contracts/TokenOWLProxy")
    const owlProxyContract = await TokenOWLProxy.deployed()
    const owlProxy = await TokenOWL.at(owlProxyContract.address)

    const allowanceOfOWL = await owlProxy.allowance.call(accounts[0], instance.address)
    const feeForAddingToken = await instance.TOKEN_ADDITION_FEE_IN_OWL.call()
    if (allowanceOfOWL < feeForAddingToken) {
      await owlProxy.approve(instance.address, feeForAddingToken)
    }

    const balanceOWL = await owlProxy.allowance.call(accounts[0], instance.address)

    if (balanceOWL < feeForAddingToken) {
      callback("Error: Sender does not have enough FeeToken to register the token")
    }

    await instance.addToken(token_address)

    console.log(`Successfully added token ${token_address}`)
    callback()
  } catch (error) {
    callback(error)
  }
}
