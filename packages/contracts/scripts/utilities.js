import { setAllowance } from "./util"
const token_list_url = "https://raw.githubusercontent.com/gnosis/dex-js/master/src/tokenList.json"

const getArgumentsHelper = function () {
  const args = process.argv.slice(4)
  const index = args.indexOf("--network")
  if (index > -1) {
    args.splice(index, 2)
  }
  return args
}

const getOrderData = async function (instance, callback, web3, argv) {
  const minBuy = web3.utils.toWei(String(argv.minBuy))
  const maxSell = web3.utils.toWei(String(argv.maxSell))

  const sender = await instance.accountToPublicKeyMap.call(argv.accountId)
  if (sender == 0x0) {
    callback(`Error: No account registerd at index ${argv.accountId}`)
  }

  const buyTokenAddress = await instance.tokenIdToAddressMap.call(argv.buyToken)
  if (buyTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.buyToken}`)
  }

  const sellTokenAddress = await instance.tokenIdToAddressMap.call(argv.sellToken)
  if (sellTokenAddress == 0x0) {
    callback(`Error: No token registered at index ${argv.sellToken}`)
  }

  return [argv.buyToken, argv.sellToken, minBuy, maxSell, sender]
}

const invokeViewFunction = async function (contract, callback) {
  try {
    const args = getArgumentsHelper()
    if (args.length < 1) {
      callback("Error: This script requires arguments - <functionName> [..args]")
    }
    const [functionName, ...arg] = args

    const instance = await contract.deployed()
    const info = await instance[functionName].call(...arg)

    console.log(info)
    callback()
  } catch (error) {
    callback(error)
  }
}

async function createMintableToken(artifacts) {
  const ERC20Mintable = artifacts.require("ERC20Mintable")
  return ERC20Mintable.new()
}

async function _mintOwl({ account, minter, amount, owl }) {
  console.log("Mint %d of OWL for user %s", amount, account)
  return owl.mintOWL(account, amount, { from: minter })
}

async function mintTokens({ tokens, minter, users, amount }) {
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < users.length; j++) {
      await mintToken({ token: tokens[i], account: users[j], minter, amount })
    }
  }
}

async function mintToken({ token, account, minter, amount }) {
  console.log("Mint %d of token %s for user %s. Using %s as the minter", amount, token.address, account, minter)
  await token.mint(account, amount, { from: minter })
}

async function deleteOrders({ orderIds, accounts, batchExchange }) {
  console.log("Cancel %d orders for %d users", orderIds.length, accounts.length)
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i]
    const account = accounts[i]
    const cancelReceipt = await batchExchange.cancelOrders([orderId], { from: account })
    const events = cancelReceipt.logs.map((log) => log.event).join(", ")
    console.log("Canceled/Deleted order %s for user %s. Emitted events: %s", orderId.toString(10), account, events)
  }
}

async function getBatchId(batchExchange) {
  const batchId = await batchExchange.getCurrentBatchId.call()
  return batchId.toNumber()
}

async function submitSolution({ name, batchId, solution, solverAddress, batchExchange }) {
  console.log(`Submit "${name}":
  - Objective value: ${solution.objectiveValue}
  - Touched orders: ${solution.touchedorderIds.join(", ")}
  - Volumes: ${solution.volumes.join(", ")}
  - Prices: ${solution.prices.join(", ")}
  - Token ids for prices: ${solution.tokenIdsForPrice.join(", ")}`)
  const objectiveValue = await batchExchange.submitSolution(
    batchId,
    1,
    solution.owners,
    solution.touchedorderIds,
    solution.volumes,
    solution.prices,
    solution.tokenIdsForPrice,
    { from: solverAddress }
  )
  console.log(`Transaction for ${name}: ${objectiveValue.tx}`)
}

async function setAllowances({ users, amount, batchExchange, tokens }) {
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      await setAllowance({
        token: tokens[j],
        account: users[i],
        amount,
        batchExchange,
      })
    }
  }
}

async function mintOwl({ users, minter, amount, owl }) {
  for (let i = 0; i < users.length; i++) {
    await _mintOwl({ account: users[i], minter, amount, owl })
  }
}

module.exports = {
  getArgumentsHelper,
  getOrderData,
  invokeViewFunction,
  token_list_url,
  mintOwl,
  deleteOrders,
  setAllowances,
  submitSolution,
  getBatchId,
  createMintableToken,
  mintTokens,
}
