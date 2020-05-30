import BN from "bn.js";
import { getOrdersPaginated } from "../src/onchain_reading";
import type { Order } from "../src/encoding";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.get_auction_elements");

const BatchExchange = artifacts.require("BatchExchange");
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
    describe: "The page size for the function getOrdersPaginated",
  })
  .version(false).argv;

const COLORS = {
  NONE: "\x1b[0m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
};

const formatAmount = function (amount: BN) {
  const string = amount.toString();
  if (string.length > 4) {
    return `${string.substring(0, 2)} * 10^${string.length - 2}`;
  } else {
    return string;
  }
};

const colorForValidFrom = function (order: Order<BN>, currentBatchId: number) {
  let color = COLORS.NONE;
  if (order.validFrom >= currentBatchId) {
    color = COLORS.RED;
    if (order.validFrom - 5 <= currentBatchId) {
      color = COLORS.YELLOW;
    }
  }
  return color;
};

const colorForValidUntil = function (order: Order<BN>, currentBatchId: number) {
  let color = COLORS.NONE;
  if (order.validUntil - 5 <= currentBatchId) {
    color = COLORS.YELLOW;
    if (order.validUntil <= currentBatchId) {
      color = COLORS.RED;
    }
  }
  return color;
};

const colorForRemainingAmount = function (order: Order<BN>) {
  if (
    order.priceDenominator.gt(new BN(0)) &&
    order.remainingAmount
      .mul(new BN(100))
      .div(order.priceDenominator)
      .lt(new BN(1))
  ) {
    return COLORS.YELLOW;
  } else {
    return COLORS.NONE;
  }
};

const printOrder = function (order: Order<BN>, currentBatchId: number) {
  /* eslint-disable no-console */
  console.log("{");
  console.log(`  user: ${order.user}`);
  console.log(`  sellTokenBalance: ${formatAmount(order.sellTokenBalance)}`);
  console.log(`  buyToken: ${order.buyToken}`);
  console.log(`  sellToken: ${order.sellToken}`);
  console.log(
    `  ${colorForValidFrom(order, currentBatchId)}validFrom: ${new Date(
      order.validFrom * 300 * 1000,
    )}${COLORS.NONE}`,
  );
  console.log(
    `  ${colorForValidUntil(order, currentBatchId)}validUntil: ${new Date(
      order.validUntil * 300 * 1000,
    )}${COLORS.NONE}`,
  );
  console.log(
    `  price: Sell ${formatAmount(
      order.priceDenominator,
    )} for at least ${formatAmount(order.priceNumerator)}`,
  );
  console.log(
    `  ${colorForRemainingAmount(order)}remaining: ${formatAmount(
      order.remainingAmount,
    )}${COLORS.NONE}`,
  );
  console.log("}");
  /* eslint-enable no-console */
};

module.exports = async (callback: Truffle.ScriptCallback) => {
  try {
    const exchange = await BatchExchange.deployed();
    log.info("Retrieving auction elements from EVM. This may take a while...");
    let auctionElementsDecoded = await getOrdersPaginated(
      exchange.contract,
      argv.pageSize,
    );

    const batchId = (await exchange.getCurrentBatchId()).toNumber();
    if (!argv.expired) {
      auctionElementsDecoded = auctionElementsDecoded.filter(
        (order) => order.validUntil >= batchId,
      );
    }

    if (argv.covered) {
      auctionElementsDecoded = auctionElementsDecoded.filter(
        (order) => !order.sellTokenBalance.isZero(),
      );
    }

    if (argv.tokens) {
      const tokens = new Set(
        argv.tokens.split(",").map((t: string) => parseInt(t.trim())),
      );
      auctionElementsDecoded = auctionElementsDecoded.filter(
        (order) => tokens.has(order.buyToken) && tokens.has(order.sellToken),
      );
    }

    auctionElementsDecoded.forEach((order) => printOrder(order, batchId));
    log.info(`Found ${auctionElementsDecoded.length} orders`);

    callback();
  } catch (error) {
    callback(error);
  }
};
