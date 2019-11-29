const BatchExchange = artifacts.require("BatchExchange")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const argv = require("yargs")
  .option("numAccounts", {
    describe: "Number of accounts to register with exchange",
    default: 3,
  })
  .option("numTokens", {
    describe: "Number of tokens to create, fund and add to exchange",
    default: 3,
  })
  .help()
  .version(false).argv

module.exports = async function(callback) {
  try {
    const instance = await BatchExchange.deployed()
    const TokenOWL = artifacts.require("TokenOWL")
    const TokenOWLProxy = artifacts.require("TokenOWLProxy")
    const owlProxyContract = await TokenOWLProxy.deployed()
    const owlProxy = await TokenOWL.at(owlProxyContract.address)

    const accounts = await web3.eth.getAccounts()
    await owlProxy.setMinter(accounts[0])
    const amount = web3.utils.toWei("3000")

    await owlProxy.mintOWL(accounts[0], amount)
    await owlProxy.approve(instance.address, amount)

    console.log(`Beginning environment setup with ${argv.numAccounts} accounts and ${argv.numTokens} tokens`)

    // Create and register tokens (feeToken is already registered)
    const tokens = [owlProxy]
    for (let i = 1; i < argv.numTokens; i++) {
      const token = await ERC20Mintable.new()
      await instance.addToken(token.address)
      tokens.push(token)
    }

    // Create balance and approval for tokens
    for (let account = 0; account < argv.numAccounts; account++) {
      for (let token = 0; token < argv.numTokens; token++) {
        if (token == 0) {
          await owlProxy.mintOWL(accounts[account], amount)
        } else {
          await tokens[token].mint(accounts[account], amount)
        }
        await tokens[token].approve(instance.address, amount, { from: accounts[account] })
      }
    }

    console.log("Environment setup complete")
    callback()
  } catch (error) {
    callback(error)
  }
}
