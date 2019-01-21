/* eslint-disable indent */
const SnappBase = artifacts.require("SnappBase")
const ERC20Mintable = artifacts.require("./ERC20Mintable.sol")

// I don't understand how to import files. [ReferenceError: artifacts is not defined]
// const { setupEnvironment } = require("../test/utilities.js")(artifacts)

/**
 * funds accounts with specified value for Mintable Token
 * The object consists of:
 * 1.) minter/owner of token (i.e. minter)
 * 2.) list of accounts
 * 3.) ERC20Mintable token
 * 4.) amount to be funded
 */
const fundAccounts = async function(minter, accounts, token, amount) {
    console.log("Funding %d accounts with token %s...", accounts.length, token.address)
    for (let i = 0; i < accounts.length; i++) {
      await token.mint(accounts[i], amount, { from: minter})
    }
  }
  
  /**
   * approves contract for spending on behalf of accounts for specific token
   * The object consists of:
   * 1.) contract to be approved
   * 2.) list of accounts
   * 3.) ERC20Mintable token
   * 4.) amount to be approved
   */
  const approveContract = async function(contract, accounts, token, value) {
    console.log(
        "Approving contract for amount %d of token %s on %d accounts...", value, token.address, accounts.length)
    for (let i = 0; i < accounts.length; i++) {
      await token.approve(contract.address, value, { from: accounts[i] })
    }
  }
  
  /**
   * opens accounts at their index + 1 on contract
   * The object consists of:
   * 1.) contract to register account
   * 2.) list of accounts
   */
  const openAccounts = async function(contract, accounts) {
    console.log("Opening %d accounts...", accounts.length)
    for (let i = 0; i < accounts.length; i++) {
      await contract.openAccount(i + 1, { from: accounts[i] })
    }
  }
  
  /**
   * depoloys and registers tokens on contract 
   * The object consists of:
   * 1.) contract to register account
   * 2.) owner of contract
   * 3.) number of tokens to be registered 
   */
  const registerTokens = async function(contract, token_owner, numTokens) {
    console.log("Registering %d tokens to %s", numTokens, token_owner)
    const res = []
    const owner = await contract.owner()
    for (let i = 0; i < numTokens; i++) {
      const token = await ERC20Mintable.new({ from: token_owner })
      res.push(token)
      await contract.addToken(token.address, { from: owner })
    }
    return res
  }
  
  /**
   * depoloys tokens, funds opens accounts, approves contract for transfer and opens accounts 
   * The object consists of:
   * 1.) BatchAuction Contract
   * 2.) desired token owner (ideally not contract owner)
   * 3.) accounts to be funded and registered
   * 4.) number of tokens to be registered
   * @returns {Array} tokens
   */
  const setupEnvironment = async function(contract, token_owner, accounts, numTokens) {
    const tokens = await registerTokens(contract, token_owner, numTokens)
    for (let i = 0; i < tokens.length; i++) {openAccounts
      await fundAccounts(token_owner, accounts, tokens[i], 100)
      await approveContract(contract, accounts, tokens[i], 100)
    }
    await openAccounts(contract, accounts)
    return tokens
  }


module.exports = async function() {
    const instance = await SnappBase.deployed()
    const accounts = await web3.eth.getAccounts()
    const token_owner = accounts[1]

    await setupEnvironment(instance, token_owner, accounts, 10)
    console.log("Environment setup complete")
    return "Environment setup complete"
}