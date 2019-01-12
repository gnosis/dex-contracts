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
 * 1.) owner of token (i.e. minter)
 * 2.) list of accounts
 * 3.) ERC20Mintable token
 * 4.) amount to be funded
 */
const fundAccounts = async function(owner, accounts, token, amount) {
  for (let i = 0; i < accounts.length; i++) {
    await token.mint(accounts[i], amount, { from: owner})
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
}