import assert from "assert";
import BN from "bn.js";
import {flat} from "./array-shims.js";
import {Order, Solution, ObjectiveValueComputation} from "./examples/model";

/**
 * Converts the amount value to `ether` unit.
 * @param {number} value The amount to convert
 * @return {BN} The value in `ether` as a bignum
 */
export function toETH(value: number) {
  const GWEI = 1000000000;
  return new BN(value * GWEI).mul(new BN(GWEI));
}

/**
 * The fee denominator used for calculating fees.
 * @type {BN}
 */
const FEE_DENOMINATOR = new BN(1000);

/**
 * The fee denominator minus one.
 * @type {BN}
 */
const FEE_DENOMINATOR_MINUS_ONE = FEE_DENOMINATOR.sub(new BN(1));

/**
 * Removes fees to the specified value `n` times.
 * @param {BN} x The value to apply the fee to
 * @param {number} [n=1] The number of times to apply the fee, must be greater than 0
 * @return {BN} The value minus fees
 */
export function feeSubtracted(x: BN, n = 1): BN {
  const result = x.mul(FEE_DENOMINATOR_MINUS_ONE).div(FEE_DENOMINATOR);
  return n === 1 ? result : feeSubtracted(result, n - 1);
}

/**
 * Adds fees to the specified.
 * @param {BN} x The value to apply the fee to
 * @return {BN} The value plus fees
 */
export function feeAdded(x: BN): BN {
  return x.mul(FEE_DENOMINATOR).div(FEE_DENOMINATOR_MINUS_ONE);
}

/**
 * The error epsilon required for buy/sell amounts to account for rounding
 * errors.
 * @type {BN}
 */
export const ERROR_EPSILON = new BN(999000);

/**
 * Calculates the executed buy amout given a buy volume and the settled buy and
 * sell prices.
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN} buyTokenPrice The buy token price
 * @param {BN} sellTokenPrice The sell token price
 * @return {BN} The value plus fees
 */
export function getExecutedSellAmount(
  executedBuyAmount: BN,
  buyTokenPrice: BN,
  sellTokenPrice: BN
): BN {
  return executedBuyAmount
    .mul(buyTokenPrice)
    .div(FEE_DENOMINATOR_MINUS_ONE)
    .mul(FEE_DENOMINATOR)
    .div(sellTokenPrice);
}

/**
 * Calculates the utility of an order given an executed buy amount and settled
 * solution prices.
 * @param {Order} order The order
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN[]} prices The prices
 * @return {BN} The order's utility
 */
export function orderUtility(
  order: Order,
  executedBuyAmount: BN,
  prices: BN[]
): BN {
  assert(
    prices.length > order.buyToken,
    "order buy token not included in prices"
  );
  assert(
    prices.length > order.sellToken,
    "order sell token not included in prices"
  );

  const executedSellAmount = getExecutedSellAmount(
    executedBuyAmount,
    prices[order.buyToken],
    prices[order.sellToken]
  );
  const execSellTimesBuy = executedSellAmount.mul(order.buyAmount);
  const roundedUtility = executedBuyAmount
    .sub(execSellTimesBuy.div(order.sellAmount))
    .mul(prices[order.buyToken]);
  const utilityError = execSellTimesBuy
    .mod(order.sellAmount)
    .mul(prices[order.buyToken])
    .div(order.sellAmount);
  return roundedUtility.sub(utilityError);
}

/**
 * Calculates the disregarded utility of an order given an executed buy amount
 * and settled solution prices.
 * @param {Order} order The order
 * @param {BN} executedBuyAmount The executed buy amount
 * @param {BN[]} prices The prices
 * @return {BN} The order's disregarded utility
 */
export function orderDisregardedUtility(
  order: Order,
  executedBuyAmount: BN,
  prices: BN[]
): BN {
  assert(
    prices.length > order.buyToken,
    "order buy token not included in prices"
  );
  assert(
    prices.length > order.sellToken,
    "order sell token not included in prices"
  );

  const executedSellAmount = getExecutedSellAmount(
    executedBuyAmount,
    prices[order.buyToken],
    prices[order.sellToken]
  );
  // TODO: account for balances here.
  // Contract evaluates as: MIN(sellAmount - executedSellAmount, user.balance.sellToken)
  const leftoverSellAmount = order.sellAmount.sub(executedSellAmount);
  const limitTermLeft = prices[order.sellToken].mul(order.sellAmount);
  const limitTermRight = prices[order.buyToken]
    .mul(order.buyAmount)
    .mul(FEE_DENOMINATOR)
    .div(FEE_DENOMINATOR_MINUS_ONE);
  let limitTerm = toETH(0);
  if (limitTermLeft.gt(limitTermRight)) {
    limitTerm = limitTermLeft.sub(limitTermRight);
  }
  return leftoverSellAmount.mul(limitTerm).div(order.sellAmount);
}

/**
 * Calculates the total objective value for the specified solution given the
 * order book.
 * @param {Order[]} orders The orders
 * @param {Solution} solution The solution
 * @return {BN} The solution's objective value
 */
export function solutionObjectiveValue(
  orders: Order[],
  solution: Solution
): BN {
  return solutionObjectiveValueComputation(orders, solution, true).result;
}

/**
 * Calculates the solutions objective value returning a computation object with
 * all the intermediate values - useful for debugging.
 * @param {Order[]} orders The orders
 * @param {Solution} solution The solution
 * @param {boolean} [strict=true] Throw when solution is determined to be invalid
 * @return {ObjectiveValueComputation} The solution's objective value computation object
 */
export function solutionObjectiveValueComputation(
  orders: Order[],
  solution: Solution,
  strict = true
): ObjectiveValueComputation {
  const tokenCount =
    Math.max(...flat(orders.map((o) => [o.buyToken, o.sellToken]))) + 1;

  assert(
    orders.length === solution.buyVolumes.length,
    "solution buy volumes do not match orders"
  );
  assert(
    tokenCount === solution.prices.length,
    "solution prices does not include all tokens"
  );
  assert(toETH(1).eq(solution.prices[0]), "fee token price is not 1 ether");

  const touchedOrders = orders
    .map((o, i) => (solution.buyVolumes[i].isZero() ? null : [o, i]))
    .filter((pair): pair is [Order, number] => !!pair);

  const orderExecutedAmounts = orders.map(() => {
    return {buy: new BN(0), sell: new BN(0)};
  });
  const orderTokenConservation = orders.map(() =>
    solution.prices.map(() => new BN(0))
  );
  const tokenConservation = solution.prices.map(() => new BN(0));
  const utilities = orders.map(() => new BN(0));
  const disregardedUtilities = orders.map(() => new BN(0));

  for (const [order, i] of touchedOrders) {
    const buyVolume = solution.buyVolumes[i];
    const sellVolume = getExecutedSellAmount(
      solution.buyVolumes[i],
      solution.prices[order.buyToken],
      solution.prices[order.sellToken]
    );

    orderExecutedAmounts[i] = {buy: buyVolume, sell: sellVolume};

    orderTokenConservation[i][order.buyToken].isub(buyVolume);
    orderTokenConservation[i][order.sellToken].iadd(sellVolume);

    tokenConservation[order.buyToken].isub(buyVolume);
    tokenConservation[order.sellToken].iadd(sellVolume);

    utilities[i] = orderUtility(order, solution.buyVolumes[i], solution.prices);
    disregardedUtilities[i] = orderDisregardedUtility(
      order,
      solution.buyVolumes[i],
      solution.prices
    );
  }

  if (strict) {
    const feeTokenTouched =
      orders.findIndex(
        (o, i) =>
          !solution.buyVolumes[i].isZero() &&
          (o.buyToken === 0 || o.sellToken === 0)
      ) !== -1;
    assert(feeTokenTouched, "fee token is not touched");
    assert(!tokenConservation[0].isNeg(), "fee token conservation is negative");
    tokenConservation
      .slice(1)
      .forEach((conservation, i) =>
        assert(
          conservation.isZero(),
          `token conservation not respected for token ${i + 1}`
        )
      );
    touchedOrders.forEach(([, id], i) => {
      assert(!utilities[i].isNeg(), `utility for order ${id} is negative`);
      assert(
        !disregardedUtilities[i].isNeg(),
        `disregarded utility for order ${id} is negative`
      );
    });
  }

  const totalUtility = utilities.reduce((acc, du) => acc.iadd(du), toETH(0));
  const totalDisregardedUtility = disregardedUtilities.reduce(
    (acc, du) => acc.iadd(du),
    toETH(0)
  );
  const burntFees = tokenConservation[0].div(new BN(2));

  const result = totalUtility.sub(totalDisregardedUtility).add(burntFees);
  if (strict) {
    assert(
      !result.isNeg() && !result.isZero(),
      "objective value negative or zero"
    );
  }

  return {
    orderExecutedAmounts,
    orderTokenConservation,
    tokenConservation,
    utilities,
    disregardedUtilities,
    totalUtility,
    totalDisregardedUtility,
    burntFees,
    result,
  };
}
