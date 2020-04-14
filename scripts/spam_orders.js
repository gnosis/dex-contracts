const { decodeOrdersBN } = require("../src/encoding")
const BN = require("bn.js")
const argv = require("yargs")
  .option("accountId", {
    describe: "The account ID used to fund the order placement.",
    default: 0,
  })
  .option("accounts", {
    describe: "The number of accounts to submit orders for.",
    default: 100,
  })
  .option("batchSize", {
    describe: "The number of concurrent requests.",
    default: 10,
  })
  .option("count", {
    describe: "The number of dummy orders to submit per account. " +
              "Each order will be submitted in successive batches.",
    default: 1,
  })
  .option("pageSize", {
    describe: "The page size to use when checking the orderbook is " +
              "still retrievable.",
    default: 100,
  })
  .help(true)
  .version(false).argv

const BatchExchange = artifacts.require("BatchExchange")
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")

const OWL = 0
const WETH = 1

/**
 * Retrieve the batch index based on system time.
 */
function batchIndex() {
  return ~~(Date.now() / (300 * 1000))
}

/**
 * Create a transaction object for placing an order.
 */
function placeOrderTx(instance) {
  return {
    to: instance.address,
    data: instance
      .contract
      .methods
      .placeOrder(
        WETH, OWL,
        batchIndex() + 3,
        web3.utils.toWei("1"), web3.utils.toWei("180"),
      )
      .encodeABI()
  }
}

/**
 * Generate an account and create `count` dummy orders with it.
 */
async function createDummyOrders({masterAccount, instance, nonce, gas, gasPrice}) {
  const account = web3.eth.accounts.create()

  // fund the account with some gas money
  await web3.eth.sendTransaction({
    from: masterAccount,
    to: account.address,
    nonce,
    value: new BN(gasPrice).muln(gas).muln(argv.count),
  })

  // sign and send the transaction
  for (let i = 0; i < argv.count; i++) {
    const signedTx = await account.signTransaction({
      gas,
      gasPrice,
      ...placeOrderTx(instance)
    })
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction)
  }
}

/**
 * Spam orders entry point.
 */
async function spamOrders() {
  console.log(`==> Creating ${argv.accounts} accounts placing ${argv.count} order(s) each`)

  const accounts = await web3.eth.getAccounts()
  const masterAccount = accounts[argv.accountId]

  const instance = await BatchExchange.deployed()

  const nonce = await web3.eth.getTransactionCount(masterAccount)
  const gas = await web3.eth.estimateGas({
    from: masterAccount,
    ...placeOrderTx(instance),
  })
  const gasPrice = await web3.eth.getGasPrice()

  const nonces = Array(argv.accounts).fill().map((_, i) => nonce + i)
  const chunks = Array(Math.ceil(argv.accounts/argv.batchSize))
    .fill()
    .map((_, i) => nonces.slice(i * argv.batchSize, (i + 1) * argv.batchSize))

  let count = 0
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (nonce) => createDummyOrders({
        masterAccount,
        instance,
        nonce,
        gas,
        gasPrice,
      }))
    )

    count += chunk.length
    console.log(`Created ${(100 * count / argv.accounts).toFixed(2)}% of orders`)
  }
}

/**
 * Try and read the orderbook successfully
 */
async function readOrderbook() {
  console.log("==> Reading complete orderbook")

  const instance = await BatchExchangeViewer.deployed()

  const start = Date.now()

  let pages = 0
  let orders = 0
  let nextPageUser = "0x0000000000000000000000000000000000000000"
  let nextPageUserOffset = 0
  let hasNextPage = true

  while (hasNextPage) {
    const page = await instance
      .contract
      .methods
      .getFilteredOrdersPaginated(
        [999999999, 0, batchIndex() + 1],
        [],
        nextPageUser,
        nextPageUserOffset,
        argv.pageSize
      )
      .call()

    pages++
    orders += decodeOrdersBN(page.elements).length

    hasNextPage = page.hasNextPage
    nextPageUser = page.nextPageUser
    nextPageUserOffset = page.nextPageUserOffset
  }

  const duration = (Date.now() - start) / 1000
  console.log(`Retrieved ${orders} orders over ${pages} pages in ${duration}s`)
}

module.exports = async (callback) => {
  try {
    await spamOrders()
    await readOrderbook()

    callback()
  } catch (error) {
    callback(error)
  }
}
