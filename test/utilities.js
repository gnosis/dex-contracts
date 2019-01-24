

/*
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */
const assertRejects = async (q, msg) => {
  let res, catchFlag = false
  try {
    res = await q
    // checks if there was a Log event and its argument l contains string "R<number>"
    catchFlag = res.logs && !!res.logs.find(log => log.event === "Log" && /\bR(\d+\.?)+/.test(log.args.l))
  } catch (e) {
    catchFlag = true
  } finally {
    if (!catchFlag) {
      assert.fail(res, null, msg)
    }
  }
}

/**
 * funds accounts with specified value for Mintable Token
 * The object consists of:
 * 1.) minter/owner of token (i.e. minter)
 * 2.) list of accounts
 * 3.) ERC20Mintable token
 * 4.) amount to be funded
 */
const fundAccounts = async function(minter, accounts, token, amount) {
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
const registerTokens = async function(token_artifact, contract, token_owner, numTokens) {
  const res = []
  const owner = await contract.owner()
  for (let i = 0; i < numTokens; i++) {
    const token = await token_artifact.new({ from: token_owner })
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
const setupEnvironment = async function(token_artifact, contract, token_owner, accounts, numTokens) {
  const tokens = await registerTokens(token_artifact, contract, token_owner, numTokens)
  for (let i = 0; i < tokens.length; i++) {openAccounts
    await fundAccounts(token_owner, accounts, tokens[i], 100)
    await approveContract(contract, accounts, tokens[i], 100)
  }
  await openAccounts(contract, accounts)
  return tokens
}

// Wait for n blocks to pass
const waitForNBlocks = async function(numBlocks, authority) {
  for (let i = 0; i < numBlocks; i++) {
    await web3.eth.sendTransaction({from: authority, "to": authority, value: 10})
  }
}

module.exports = {
  assertRejects,
  waitForNBlocks,
  fundAccounts,
  approveContract,
  openAccounts,
  registerTokens,
  setupEnvironment
}