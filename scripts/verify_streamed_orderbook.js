const assert = require("assert-diff")
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

module.exports = async () => {
  const viewer = await BatchExchangeViewer.deployed()

  console.debug("==> initializing streamed orderbook...")
  const orderbook = await StreamedOrderbook.init(web3, {
    strict: true,
    debug: (msg) => console.debug(msg),
  })

  let done = false
  let latestBlock = await orderbook.update()

  const updateFiber = (async () => {
    while (!done) {
      await sleep(UPDATE_INTERVAL)
      try {
        console.debug(`==> updating streamed orderbook...`)
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
        console.debug(`==> checked orderbooks at block ${latestBlock}...`)
        const queriedOrders = await getOpenOrders(viewer, 300, latestBlock)
        assert.deepEqual(toDiffableOrders(streamedOrders), toDiffableOrders(queriedOrders))
      } catch (err) {
        console.warn(`error while checking orderbook: ${err}`)
      }
      await sleep(CHECK_INTERVAL)
    }
  })()

  await Promise.any([updateFiber, checkFiber])
  done = true
  await Promise.all([updateFiber, checkFiber])
}
