const BatchExchange = artifacts.require("BatchExchange")
const BN = require("bn.js")
const argv = require("yargs")
  .option("expired", {
    type: "boolean",
    describe: "Also show expired orders",
  })
  .option("covered", {
    type: "boolean",
    describe: "Only show orders that have some balance in the sell token",
  })
  .option("tokens", {
    describe: "Filter only orders between the given tokens",
  })
  .option("pageSize", {
    default: 100,
    describe: "The page  size for the function getOrdersPaginated",
  })
  .version(false).argv

const { getOrdersPaginated } = require("./utilities")

const COLORS = {
  NONE: "\x1b[0m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
}

const formatAmount = function(amount) {
  const string = amount.toString()
  if (string.length > 4) {
    return `${string.substring(0, 2)} * 10^${string.length - 2}`
  } else {
    return string
  }
}

const colorForValidFrom = function(order, currentBatchId) {
  let color = COLORS.NONE
  if (order.validFrom >= currentBatchId) {
    color = COLORS.RED
    if (order.validFrom - 5 <= currentBatchId) {
      color = COLORS.YELLOW
    }
  }
  return color
}

const colorForValidUntil = function(order, currentBatchId) {
  let color = COLORS.NONE
  if (order.validUntil - 5 <= currentBatchId) {
    color = COLORS.YELLOW
    if (order.validUntil <= currentBatchId) {
      color = COLORS.RED
    }
  }
  return color
}

const colorForRemainingAmount = function(order) {
  if (
    order.priceDenominator > 0 &&
    order.remainingAmount
      .mul(new BN(100))
      .div(order.priceDenominator)
      .toNumber() < 1
  ) {
    return COLORS.YELLOW
  } else {
    return COLORS.NONE
  }
}

const printOrder = function(order, currentBatchId) {
  console.log("{")
  console.log(`  user: ${order.user}`)
  console.log(`  sellTokenBalance: ${formatAmount(order.sellTokenBalance)}`)
  console.log(`  buyToken: ${order.buyToken}`)
  console.log(`  sellToken: ${order.sellToken}`)
  console.log(`  ${colorForValidFrom(order, currentBatchId)}validFrom: ${new Date(order.validFrom * 300 * 1000)}${COLORS.NONE}`)
  console.log(
    `  ${colorForValidUntil(order, currentBatchId)}validUntil: ${new Date(order.validUntil * 300 * 1000)}${COLORS.NONE}`
  )
  console.log(`  price: Sell ${formatAmount(order.priceDenominator)} for at least ${formatAmount(order.priceNumerator)}`)
  console.log(`  ${colorForRemainingAmount(order)}remaining: ${formatAmount(order.remainingAmount)}${COLORS.NONE}`)
  console.log("}")
}

module.exports = async callback => {
  try {
    const instance = await BatchExchange.deployed()
    let auctionElementsDecoded = await getOrdersPaginated(instance, argv.pageSize)

    const batchId = (await instance.getCurrentBatchId()).toNumber()
    if (!argv.expired) {
      auctionElementsDecoded = auctionElementsDecoded.filter(order => order.validUntil >= batchId)
    }

    if (argv.covered) {
      auctionElementsDecoded = auctionElementsDecoded.filter(order => !order.sellTokenBalance.isZero())
    }

    if (argv.tokens) {
      const tokens = new Set(argv.tokens.split(",").map(t => parseInt(t)))
      auctionElementsDecoded = auctionElementsDecoded.filter(order => tokens.has(order.buyToken) && tokens.has(order.sellToken))
    }

    auctionElementsDecoded.forEach(order => printOrder(order, batchId))
    console.log(`Found ${auctionElementsDecoded.length} orders`)

    callback()
  } catch (error) {
    callback(error)
  }
}
