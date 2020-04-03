/* eslint-disable indent */
import assert from "assert";
import BN from "bn.js";
import {
  getExecutedSellAmount,
  solutionObjectiveValueComputation,
} from "../math.js";
import {flat, dedupe} from "../array-shims.js";
import {
  TestCase,
  TestCaseInput,
  ObjectiveValueComputation,
  ComputedSolution,
  ComputedOrder,
} from "./model";

/**
 * Generates a test case to be used for unit and e2e testing with the contract
 * with computed solution values and objective values.
 * @param input The input to the test case
 * @param debug Print debug information in case of
 * @param strict Throw when solution is determined to be invalid
 * @return The test case
 */
export function generateTestCase(
  input: TestCaseInput,
  strict = true,
  debug = false
): TestCase {
  const {name, orders, solutions} = input;

  return {
    name,
    numTokens:
      Math.max(...flat(orders.map((o) => [o.buyToken, o.sellToken]))) + 1,
    deposits:
      input.deposits ||
      orders.map((order) => ({
        amount: order.sellAmount,
        token: order.sellToken,
        user: order.user,
      })),
    orders,
    solutions: solutions.map(
      (solution): ComputedSolution => {
        let objectiveValue: ObjectiveValueComputation;
        try {
          objectiveValue = solutionObjectiveValueComputation(
            orders,
            solution,
            strict
          );
        } catch (err) {
          if (strict && debug) {
            const invalidObjectiveValue = solutionObjectiveValueComputation(
              orders,
              solution,
              false
            );
            debugObjectiveValueComputation(invalidObjectiveValue);
          }
          throw err;
        }

        const touchedOrders: ComputedOrder[] = orders
          .map((o, i) =>
            solution.buyVolumes[i].isZero()
              ? null
              : {
                  idx: i,
                  user: o.user,
                  buy: solution.buyVolumes[i],
                  sell: getExecutedSellAmount(
                    solution.buyVolumes[i],
                    solution.prices[o.buyToken],
                    solution.prices[o.sellToken]
                  ),
                  utility: objectiveValue.utilities[i],
                  disregardedUtility: objectiveValue.disregardedUtilities[i],
                }
          )
          .filter((o): o is ComputedOrder => !!o);
        return {
          name: solution.name,
          tokens: dedupe(
            flat(
              touchedOrders
                .map((o) => orders[o.idx])
                .map((o) => [o.buyToken, o.sellToken])
            )
          )
            .sort((a, b) => a - b)
            .map((i) => ({
              id: i,
              price: solution.prices[i],
              conservation: objectiveValue.tokenConservation[i],
            })),
          orders: touchedOrders,
          objectiveValueComputation: objectiveValue,
          totalFees: objectiveValue.burntFees.mul(new BN(2)),
          totalUtility: objectiveValue.totalUtility,
          burntFees: objectiveValue.burntFees,
          objectiveValue: objectiveValue.result,
        };
      }
    ),
  };
}

/**
 * Prints debug information for a test case.
 * @param testCase The test case
 * @param [orderIds] The optional order indices for display, defaults to [0...]
 * @param [accounts] The optional accounts for display, defaults to [1...]
 */
export function debugTestCase(
  testCase: TestCase,
  orderIds: number[],
  accounts: string[]
) {
  assert(
    orderIds === undefined || Array.isArray(orderIds),
    "orderIds is not an array"
  );
  assert(
    accounts === undefined || Array.isArray(accounts),
    "accounts is not an array"
  );

  const userCount = Math.max(...testCase.orders.map((o) => o.user)) + 1;
  orderIds = orderIds || testCase.orders.map((_, i) => i);
  accounts =
    accounts ||
    (() => {
      const accounts = [];
      for (let i = 0; i < userCount; i++) {
        accounts.push(`0x${i.toString(16).padStart(40, "0")}`);
      }
      return accounts;
    })();

  assert(
    testCase.orders.length === orderIds.length,
    "missing orders in orderIds"
  );
  assert(userCount <= accounts.length, "missing users in accounts");

  orderIds.forEach((o, i) =>
    assert(BN.isBN(o) || Number.isInteger(o), `invalid order id at index ${i}`)
  );
  accounts.forEach((a, i) =>
    assert(typeof a === "string", `invalid account at index ${i}`)
  );

  const usernames = accounts.map((a) =>
    a.length > 8 ? `${a.substr(0, 5)}…${a.substr(a.length - 3)}` : a
  );

  formatHeader("Orders");
  formatTable([
    ["Id", "User", "Buy Token", "Buy Amount", "Sell Token", "Sell Amount"],
    ...testCase.orders.map((o, i) => [
      orderIds[i],
      usernames[o.user],
      o.buyToken,
      o.buyAmount,
      o.sellToken,
      o.sellAmount,
    ]),
  ]);
  formatHeader("Solutions");
  for (const solution of testCase.solutions) {
    formatSubHeader(solution.name || "???");
    formatTable([
      ["   Touched Tokens:           ", "Id", "Price", "Conservation"],
      ...solution.tokens.map((t) => ["", t.id, t.price, t.conservation]),
    ]);
    formatTable([
      [
        "   Executed Orders:          ",
        "Id",
        "User",
        "Buy Amount",
        "Sell Amount",
        "Utility",
        "Disregarded Utility",
      ],
      ...solution.orders.map((o) => [
        "",
        orderIds[o.idx],
        usernames[o.user],
        o.buy,
        o.sell,
        o.utility,
        o.disregardedUtility,
      ]),
    ]);
    formatTable([
      ["   Total Utility:", solution.totalUtility],
      [
        "   Total Disregarded Utility:",
        solution.objectiveValueComputation.totalDisregardedUtility,
      ],
      ["   Burnt Fees:", solution.burntFees],
      ["   Objective Value:", solution.objectiveValue],
    ]);
  }
}

/**
 * Generates `submitSolution` parameters for a given computed solution. Note
 * that thifrom  order indices as they are not known until runtime
 * @param solution The computed solution
 * @param accounts The order indices as they are on the contract
 * @param orderIds The order indices as they are on the contract
 * @return The parameters to submit the solution
 */
export function solutionSubmissionParams(
  solution: ComputedSolution,
  accounts: string[],
  orderIds: number[]
) {
  const orderCount = Math.max(...solution.orders.map((o) => o.idx)) + 1;
  const userCount = Math.max(...solution.orders.map((o) => o.user)) + 1;

  assert(orderCount <= orderIds.length, "missing orders in orderIds");
  assert(userCount <= accounts.length, "missing users in accounts");

  return {
    objectiveValue: solution.objectiveValue,
    owners: solution.orders.map((o) => accounts[o.user]),
    touchedorderIds: solution.orders.map((o) => orderIds[o.idx]),
    volumes: solution.orders.map((o) => o.buy),
    prices: solution.tokens.slice(1).map((t) => t.price),
    tokenIdsForPrice: solution.tokens.slice(1).map((t) => t.id),
  };
}

/**
 * Prints debug information for an objective value compuation.
 * @param {ObjectiveValueComputation} testCase The test case
 */
export function debugObjectiveValueComputation(
  objectiveValue: ObjectiveValueComputation
) {
  formatHeader("Executed Amounts");
  formatTable([
    ["Order", "Buy", "Sell"],
    ...objectiveValue.orderExecutedAmounts.map(({buy, sell}, i) => [
      i,
      buy,
      sell,
    ]),
  ]);
  formatHeader("Token Conservation");
  formatTable([
    ["Order\\Token", ...objectiveValue.tokenConservation.map((_, i) => i)],
    ...objectiveValue.orderTokenConservation.map((o, i) => [i, ...o]),
    ["Total", ...objectiveValue.tokenConservation],
  ]);
  formatHeader("Objective Value");
  formatTable([
    ["Order", ...objectiveValue.utilities.map((_, i) => i), "Total"],
    ["Utility", ...objectiveValue.utilities, objectiveValue.totalUtility],
    [
      "Disregarded Utility",
      ...[
        ...objectiveValue.disregardedUtilities,
        objectiveValue.totalDisregardedUtility,
      ].map((du) => du.neg()),
    ],
    [
      "Burnt Fees",
      ...objectiveValue.utilities.map(() => ""),
      objectiveValue.burntFees,
    ],
    [
      "Result",
      ...objectiveValue.utilities.map(() => ""),
      objectiveValue.result,
    ],
  ]);
}

/* eslint-disable no-console */

const formatHeader = (header: string) => console.log(`=== ${header} ===`);
const formatSubHeader = (header: string) => console.log(` - ${header}`);

export function formatTable(table: any[][]) {
  const [width, height] = [
    Math.max(...table.map((r) => r.length)),
    table.length,
  ];
  const getCell = (i: any, j: any) => {
    const cell = i < height ? table[i][j] : undefined;
    return cell === undefined ? "" : cell === null ? "<NULL>" : `${cell}`;
  };

  const columnWidths = [];
  for (let j = 0; j < width; j++) {
    columnWidths.push(
      Math.max(...table.map((_, i) => getCell(i, j).length)) + 1
    );
  }

  for (let i = 0; i < height; i++) {
    const line = columnWidths
      .map((cw, j) =>
        j === 0 ? getCell(i, j).padEnd(cw) : getCell(i, j).padStart(cw)
      )
      .join(" ");
    console.log(line);
  }
}

/* eslint-enable no-console */

module.exports = {
  generateTestCase,
  debugTestCase,
  debugObjectiveValueComputation,
  solutionSubmissionParams,
};
