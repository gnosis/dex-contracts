const BatchExchange = artifacts.require("BatchExchange")
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")

const assert = require("assert-diff")

const { getOpenOrdersPaginated, getFinalizedOrdersPaginated, getOrdersPaginated } = require("../src/onchain_reading")

let mostRecentBatch = 0

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getLastBlockInBatchBefore(web3, instance, batchId) {
  let block = await web3.eth.getBlockNumber()
  while (parseInt(await instance.contract.methods.getCurrentBatchId().call(block)) >= batchId) {
    block--
  }
  return block
}

async function getOrdersFromViewer(viewer, fn, targetBlock) {
  let result = []
  try {
    for await (const page of fn(viewer.contract, 300, targetBlock)) {
      result = result.concat(page)
    }
  } catch (error) {
    throw new Error(`${fn.name} failed with ${error}`)
  }
  console.log(`${fn.name} returned ${result.length} orders`)
  return result
}

async function getOrdersFromExchange(exchange, targetBlock, targetBatch) {
  try {
    const unfiltered = await getOrdersPaginated(exchange.contract, 250, targetBlock)
    const result = unfiltered.filter((order) => order.validFrom <= targetBatch && order.validUntil >= targetBatch)
    console.log(`getOrdersFromExchange returned ${result.length} orders`)
    return result
  } catch (error) {
    throw new Error(`getOrdersFromExchange failed with ${error}`)
  }
}

module.exports = async () => {
  const instance = await BatchExchange.deployed()
  const viewer = await BatchExchangeViewer.deployed()

  for (;;) {
    try {
      const batchId = (await instance.getCurrentBatchId()).toNumber()
      if (batchId > mostRecentBatch) {
        // Wait some time to avoid reorg inconsistency
        await sleep(30000)
        const lastBlockInPreviousBatch = await getLastBlockInBatchBefore(web3, instance, batchId)
        const firstBlockInNewBatch = lastBlockInPreviousBatch + 1
        console.log(`Start verification for batch ${batchId} with blocks ${lastBlockInPreviousBatch}/${firstBlockInNewBatch}`)

        const [openOrders, finalizedOrders, legacy] = (
          await Promise.all([
            getOrdersFromViewer(viewer, getOpenOrdersPaginated, lastBlockInPreviousBatch),
            getOrdersFromViewer(viewer, getFinalizedOrdersPaginated, firstBlockInNewBatch),
            getOrdersFromExchange(instance, firstBlockInNewBatch, batchId - 1),
          ])
        ).map((r) => JSON.stringify(r))

        assert.deepEqual(openOrders, finalizedOrders, "open orders != finalized orders")
        assert.deepEqual(openOrders, legacy, "open orders != legacy orders")
        assert.deepEqual(finalizedOrders, legacy, "finalized orders != legacy orders")

        console.log(`Verification succeeded for batch ${batchId}`)
        mostRecentBatch = batchId
      }
      await sleep(10000)
    } catch (error) {
      console.error(error)
    }
  }
}
