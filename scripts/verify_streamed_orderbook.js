const assert = require("assert-diff")
const Web3 = require("web3")
const { StreamedOrderbook, getOpenOrders } = require("../build/common/src")

const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")

const UPDATE_INTERVAL = 1000
const CHECK_INTERVAL = 10000

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toDiffableOrders(orders) {
  return orders.reduce((obj, order) => {
    const user = order.user.toLowerCase()
    obj[`${user}-${order.orderId}`] = {
      ...order,
      user,
      sellTokenBalance: order.sellTokenBalance.toString(),
      priceNumerator: order.priceNumerator.toString(),
      priceDenominator: order.priceDenominator.toString(),
      remainingAmount: order.remainingAmount.toString(),
    }
    return obj
  }, {})
}

async function main() {
  const viewer = await BatchExchangeViewer.deployed()

  console.debug("==> initializing streamed orderbook...")
  // NOTE: We need `getChainId` which is not available in the truffle provided
  // web3 instance.
  const web3new = new Web3(web3.currentProvider)
  const orderbook = await StreamedOrderbook.init(web3new, { strict: true })

  let done = false
  let latestBlock = await orderbook.update()

  const updateFiber = (async () => {
    while (!done) {
      await sleep(UPDATE_INTERVAL)
      try {
        latestBlock = await orderbook.update()
      } catch (err) {
        console.warn(`error while updating orderbook: ${err}`)
      }
    }
  })()

  const checkFiber = (async () => {
    while (!done) {
      const streamedOrders = orderbook.getOpenOrders()
      try {
        console.debug(`==> checking orderbooks at block ${latestBlock}...`)
        const queriedOrders = await getOpenOrders(viewer.contract, 300, latestBlock)
        assert.deepEqual(toDiffableOrders(streamedOrders), toDiffableOrders(queriedOrders))
        console.debug(`==> streamed and queried orderbooks match.`)
      } catch (err) {
        console.warn(`error while checking orderbook: ${err}`)
      }
      await sleep(CHECK_INTERVAL)
    }
  })()

  try {
    await Promise.race([updateFiber, checkFiber])
  } catch (err) {
    console.error(`verification error: ${err}`)
  }

  done = true
  await Promise.all([updateFiber, checkFiber])
}

module.exports = async (callback) => {
  try {
    await main()
    callback()
  } catch (err) {
    callback(err)
  }
}
