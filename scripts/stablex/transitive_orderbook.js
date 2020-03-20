const BatchExchangeViewer = artifacts.require("BatchExchangeViewer")
const { decodeOrdersBN } = require("../../src/encoding.js")
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
  .option("pageSize", {
    default: 100,
    describe: "The page  size for the function getOrdersPaginated",
  })
  .demand(["sellToken", "buyToken", "sellAmount"])
  .version(false).argv

const addItemToOrderbooks = function(orderbooks, item) {
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

const getAllOrderbooks = async function(instance, pageSize) {
  let nextPageUser = "0x0000000000000000000000000000000000000000"
  let nextPageUserOffset = 0
  let lastPageSize = pageSize

  const orderbooks = new Map() // Mapping orderbook.pair => {bids, asks}

  while (lastPageSize == pageSize) {
    console.log("Fetching Page")
    const page = await instance.getOpenOrderBookPaginated([], nextPageUser, nextPageUserOffset, pageSize)
    const elements = decodeOrdersBN(page.elements)
    // Split elements in buy and sell
    elements.forEach(item => {
      addItemToOrderbooks(orderbooks, item)
    })

    //Update page info
    lastPageSize = elements.length
    nextPageUser = page.nextPageUser
    nextPageUserOffset = page.nextPageUserOffset
  }
  return orderbooks
}

const transitiveOrderbook = function(orderbooks, start, end) {
  const result = new Orderbook(start, end)
  // Add the direct book if it exists
  if (orderbooks.has(result.pair())) {
    result.add(orderbooks.get(result.pair()))
  }

  // Check for each orderbook that starts with same baseToken, if there exists a connecting book.
  // If yes, build transitive closure
  orderbooks.forEach(book => {
    const otherBook = orderbooks.get(new Orderbook(book.quoteToken, end).pair())
    if (book.baseToken === start && otherBook) {
      const closure = book.transitiveClosure(otherBook)
      result.add(closure)
    }
  })
  return result
}

module.exports = async callback => {
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

    const transitive_book = transitiveOrderbook(orderbooks, argv.sellToken, argv.buyToken)
    const price = transitive_book.priceToSellBaseToken(sellAmount)
    console.log(
      `Suggested price to sell ${argv.sellAmount} of token ${argv.sellToken} for token ${argv.buyToken} is: ${price.toNumber()}`
    )
    callback()
  } catch (error) {
    callback(error)
  }
}
