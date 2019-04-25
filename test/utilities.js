
const { sha256 } = require("ethereumjs-util")
const memoize = require("fast-memoize")
const MerkleTree = require("merkletreejs")

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
    await token.mint(accounts[i], amount, { from: minter })
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
    await contract.openAccount(i, { from: accounts[i] })
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
  const amount = "300000000000000000000"
  for (let i = 0; i < tokens.length; i++) {openAccounts
    await fundAccounts(token_owner, accounts, tokens[i], amount)
    await approveContract(contract, accounts, tokens[i], amount)
  }
  await openAccounts(contract, accounts)
  return tokens
}

const jsonrpc = "2.0"
const id = 0
const send = function (method, params, web3Provider) {
  return new Promise(function(resolve, reject) {
    web3Provider.currentProvider.send({ id, jsonrpc, method, params }, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    })
  })
}

// Wait for n blocks to pass
const waitForNSeconds = async function(seconds, web3Provider=web3) {
  const currentBlock = await web3Provider.eth.getBlockNumber()
  const currentTime = (await web3Provider.eth.getBlock(currentBlock)).timestamp
  await send("evm_mine", [currentTime + seconds], web3Provider)
}

const toHex = function(buffer) {
  buffer = buffer.toString("hex")
  if (buffer.substring(0, 2) == "0x")
    return buffer
  return "0x" + buffer.toString("hex")
}

const countDuplicates = function(obj, num) {
  obj[num] = (++obj[num] || 1)
  return obj
}

/**
 * Given a sequence of index1, elements1, ..., indexN elementN this function returns 
 * the corresponding MerkleTree of height 7.
 */
const _generateMerkleTree = function(...args) {
  const txs = Array(2**7).fill(sha256(0x0))
  for (let i=0; i<args.length; i+=2) {
    txs[args[i]] = args[i+1]
  }
  return new MerkleTree(txs, sha256)
}
const generateMerkleTree = memoize(_generateMerkleTree, {
  strategy: memoize.strategies.variadic
})

module.exports = {
  assertRejects,
  waitForNSeconds,
  fundAccounts,
  approveContract,
  openAccounts,
  registerTokens,
  setupEnvironment,
  toHex,
  countDuplicates,
  generateMerkleTree,
}
