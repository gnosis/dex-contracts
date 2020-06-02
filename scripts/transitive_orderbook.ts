import BN from "bn.js";
import { getOpenOrdersPaginated } from "../src/onchain_reading";
import { Orderbook, Offer, transitiveOrderbook } from "../src/orderbook";
import { Fraction } from "../src/fraction";
import { factory } from "../src/logging";
import { BatchExchangeViewerInstance } from "../build/truffle-typings";
import type { IndexedOrder } from "../src/encoding";

const log = factory.getLogger("scripts.setup_environment");
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer");

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
  .version(false).argv;

const addItemToOrderbooks = function (
  orderbooks: Map<string, Orderbook>,
  item: IndexedOrder<BN>,
) {
  let orderbook = new Orderbook(item.sellToken, item.buyToken);
  if (!orderbooks.has(orderbook.pair())) {
    orderbooks.set(orderbook.pair(), orderbook);
  }
  // We have explicitly ensured above that this will not be null.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  orderbook = orderbooks.get(orderbook.pair())!;
  const price = new Fraction(item.priceNumerator, item.priceDenominator);
  const volume = new Fraction(
    item.remainingAmount.gt(item.sellTokenBalance)
      ? item.sellTokenBalance
      : item.remainingAmount,
    1,
  );
  // Smaller orders cannot be matched anyways
  if (volume.gt(new Fraction(10000, 1))) {
    orderbook.addAsk(new Offer(price, volume));
  }
};

const getAllOrderbooks = async function (
  instance: BatchExchangeViewerInstance,
  pageSize: number,
) {
  const orderbooks = new Map();
  for await (const page of getOpenOrdersPaginated(
    instance.contract,
    pageSize,
  )) {
    log.info("Fetched Page");
    page.forEach((item) => {
      addItemToOrderbooks(orderbooks, item);
    });
  }
  return orderbooks;
};

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const sellAmount = new BN(argv.sellAmount);
    const instance = await BatchExchangeViewer.deployed();
    const orderbooks = await getAllOrderbooks(instance, argv.pageSize);
    const transitive_book = transitiveOrderbook(
      orderbooks,
      argv.sellToken,
      argv.buyToken,
      parseInt(argv.hops),
    );
    const price = transitive_book.priceToSellBaseToken(sellAmount);
    log.info(
      `Suggested price to sell ${argv.sellAmount} of token ${
        argv.sellToken
      } for token ${argv.buyToken} is: ${price?.toNumber()}`,
    );
    callback();
  } catch (error) {
    callback(error);
  }
};
