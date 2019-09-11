const StablecoinConverter = artifacts.require("StablecoinConverter")
const ERC20Mintable = artifacts.require("ERC20Mintable.sol")
const argv = require("yargs").argv

module.exports = async function (callback) {
  try {
    const numAccounts = argv.numAccounts || 3
    const numTokens = argv.numTokens || 3
    const instance = await StablecoinConverter.deployed()
    const accounts = await web3.eth.getAccounts()
    console.log(`Beginning environment setup with ${numAccounts} accounts and ${numTokens} tokens`)

    const amount = "300000000000000000000"

    // Create and register tokens (feeToken is already registered)
    const tokens = [await ERC20Mintable.deployed()]
    for (let i = 1; i < numTokens; i++) {
      const token = await ERC20Mintable.new()
      await instance.addToken(token.address)
      tokens.push(token)
    }

    // Create balance and approval for tokens
    for (let account = 0; account < numAccounts; account++) {
      for (let token = 0; token < numTokens; token++) {
        await tokens[token].mint(accounts[account], amount)
        await tokens[token].approve(instance.address, amount, { from: accounts[account] })
      }
    }

    console.log("Environment setup complete")
    callback()
  } catch (error) {
    callback(error)
  }
}
