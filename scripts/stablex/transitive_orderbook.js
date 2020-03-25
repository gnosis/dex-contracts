const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")
const { getOpenOrdersPaginated } = require("./utilities.js")
const BN = require("bn.js")

const { Orderbook, Offer } = require("../../typescript/common/orderbook.js")
const { Fraction } = require("../../typescript/common/fraction.js")

const argv = require("yargs")
  .option("sellToken", {
    describe: "the token you are looking to sell",
  })
  .option("buyToken", {
    describe: "the token you are looking to sell",
  })
  .option("sellAmount", {
    describe: "the amount you are looking to sell",
  })
  .option("hops", {
    default: 1,
    describe: "Number of hops in potential ring trades",
  })
  .option("pageSize", {
    default: 100,
    describe: "The page  size for the function getOrdersPaginated",
  })
  .demand(["sellToken", "buyToken", "sellAmount"])
  .version(false).argv

const addItemToOrderbooks = function (orderbooks, item) {
  let orderbook = new Orderbook(item.sellToken, item.buyToken)
  if (!orderbooks.has(orderbook.pair())) {
    orderbooks.set(orderbook.pair(), orderbook)
  }
  orderbook = orderbooks.get(orderbook.pair())
  const price = new Fraction(item.priceNumerator, item.priceDenominator)
  const volume = new Fraction(item.remainingAmount.gt(item.sellTokenBalance) ? item.sellTokenBalance : item.remainingAmount, 1)
  // Smaller orders cannot be matched anyways
  if (volume.gt(new Fraction(10000, 1))) {
    orderbook.addAsk(new Offer(price, volume))
  }
}

const getAllOrderbooks = async function (instance, pageSize) {
  const elements = await getOpenOrdersPaginated(instance, pageSize)
  const orderbooks = new Map()
  elements.forEach((item) => {
    addItemToOrderbooks(orderbooks, item)
  })
  return orderbooks
}

const transitiveOrderbook = function (orderbooks, start, end, hops, ignore) {
  const result = new Orderbook(start, end)
  // Add the direct book if it exists
  if (orderbooks.has(result.pair())) {
    result.add(orderbooks.get(result.pair()))
  }

  if (hops === 0) {
    return result
  }

  // Check for each orderbook that starts with same baseToken, if there exists a connecting book.
  // If yes, build transitive closure
  orderbooks.forEach((book) => {
    if (book.baseToken === start && !(book.quoteToken === end) && !ignore.includes(book.quoteToken)) {
      const otherBook = transitiveOrderbook(orderbooks, book.quoteToken, end, hops - 1, ignore.concat(book.baseToken))
      const closure = book.transitiveClosure(otherBook)
      result.add(closure)
    }
  })
  return result
}

module.exports = async (callback) => {
  try {
    const sellAmount = new BN(argv.sellAmount)
    const instance = await BatchExchangeViewer.deployed()
    const orderbooks = await getAllOrderbooks(instance, argv.pageSize)

    // complete ask-only orderbooks with bid information
    for (const [, book] of orderbooks) {
      if (!orderbooks.has(book.inverted().pair())) {
        const empty_book = new Orderbook(book.quoteToken, book.baseToken)
        orderbooks.set(empty_book.pair(), empty_book)
      }
    }
    for (const [pair, book] of orderbooks) {
      const inverse = book.inverted()
      const inverse_pair = inverse.pair()

      // Only update one of the two sides
      if (pair > inverse_pair) {
        orderbooks.get(inverse_pair).add(inverse)
        orderbooks.set(pair, orderbooks.get(inverse_pair).inverted())
      }
    }

    const transitive_book = transitiveOrderbook(orderbooks, argv.sellToken, argv.buyToken, parseInt(argv.hops), [])
    const price = transitive_book.priceToSellBaseToken(sellAmount)
    console.log(
      `Suggested price to sell ${argv.sellAmount} of token ${argv.sellToken} for token ${argv.buyToken} is: ${price.toNumber()}`
    )
    callback()
  } catch (error) {
    callback(error)
  }
}
