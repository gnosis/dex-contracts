/* eslint-disable indent */
const assert = require("assert")
const BN = require("bn.js")
const { getExecutedSellAmount, solutionObjectiveValueComputation } = require("../math.js")
const { flat, dedupe } = require("../array-shims.js")

/**
 * @typedef TestCaseInput
 * @type {object}
 * @property {string?} name The name of the test case
 * @property {Order[]} orders The orders
 * @property {Solution[]} solutions The solutions
 */

/**
 * @typedef Deposit
 * @type {object}
 * @property {BN} amount The deposit amount
 * @property {number} token The deposited token
 * @property {number} user The user making the deposit
 *
 * @typedef Token
 * @type {object}
 * @property {number} id The token id
 * @property {BN} price The price
 * @property {BN} conservation The conservation value for this token
 *
 * @typedef ComputedOrder
 * @type {object}
 * @property {number} idx The order index
 * @property {number} user The user that submitted the order
 * @property {BN} buy The computed buy volume
 * @property {BN} buy The computed buy volume
 * @property {BN} utility The computed utility of the order
 * @property {BN} disregardedUtility The computed disregarded utility of the order
 *
 * @typedef ComputedSolution
 * @type {object}
 * @property {string?} name An optional descriptive name
 * @property {Token[]} tokens The touched tokens with prices
 * @property {ComputedOrder[]} orders The touched order volumes
 * @property {ObjectiveValueComputation} objectiveValueComputation The objective value computation details
 * @property {BN} totalFees The accumulated fees
 * @property {BN} totalUtility The objective value of the solution
 * @property {BN} totalDisregardedUtility The objective value of the solution
 * @property {BN} burntFees The burnt fees included in the objective value, equal to `totalFees / 2`
 * @property {BN} objectiveValue The objective value of the solution
 *
 * @typedef TestCase
 * @type {object}
 * @property {number} numTokens The required number of tokens
 * @property {number} numUsers The required number of tokens
 * @property {Deposit[]} deposits The required deposits
 * @property {Order[]} orders The buy amount
 * @property {ComputedSolution[]} solutions The solutions with computed values
 */

/**
 * Generates a test case to be used for unit and e2e testing with the contract
 * with computed solution values and objective values.
 * @param {TestCaseInput} input The input to the test case
 * @param {boolean} [debug=false] Print debug information in case of
 * @return {TestCase} The test case
 */
function generateTestCase(input, strict = true, debug = false) {
  const { name, orders, solutions } = input

  return {
    name,
    numTokens: Math.max(...flat(orders.map((o) => [o.buyToken, o.sellToken]))) + 1,
    deposits:
      input.deposits ||
      orders.map((order) => ({
        amount: order.sellAmount,
        token: order.sellToken,
        user: order.user,
      })),
    orders,
    solutions: solutions.map((solution) => {
      let objectiveValue
      try {
        objectiveValue = solutionObjectiveValueComputation(orders, solution, strict)
      } catch (err) {
        if (strict && debug) {
          const invalidObjectiveValue = solutionObjectiveValueComputation(orders, solution, false)
          debugObjectiveValueComputation(invalidObjectiveValue)
        }
        throw err
      }

      const touchedOrders = orders
        .map((o, i) =>
          solution.buyVolumes[i].isZero()
            ? null
            : {
                idx: i,
                user: o.user,
                buy: solution.buyVolumes[i],
                sell: getExecutedSellAmount(solution.buyVolumes[i], solution.prices[o.buyToken], solution.prices[o.sellToken]),
                utility: objectiveValue.utilities[i],
                disregardedUtility: objectiveValue.disregardedUtilities[i],
              }
        )
        .filter((o) => !!o)
      return {
        name: solution.name,
        tokens: dedupe(flat(touchedOrders.map((o) => orders[o.idx]).map((o) => [o.buyToken, o.sellToken])))
          .sort((a, b) => a - b)
          .map((i) => ({
            id: i,
            price: solution.prices[i],
            conservation: objectiveValue.tokenConservation[i],
          })),
        orders: touchedOrders,
        objectiveValueComputation: objectiveValue,
        totalFees: objectiveValue.totalFees,
        totalUtility: objectiveValue.totalUtility,
        totalDisregardedUtility: objectiveValue.totalDisregardedUtility,
        burntFees: objectiveValue.burntFees,
        objectiveValue: objectiveValue.result,
      }
    }),
  }
}

/**
 * Prints debug information for a test case.
 * @param {TestCase} testCase The test case
 * @param {BN[]|number[]} [orderIds] The optional order indices for display, defaults to [0...]
 * @param {string[]} [accounts] The optional accounts for display, defaults to [1...]
 */
function debugTestCase(testCase, orderIds, accounts) {
  assert(orderIds === undefined || Array.isArray(orderIds), "orderIds is not an array")
  assert(accounts === undefined || Array.isArray(accounts), "accounts is not an array")

  const userCount = Math.max(...testCase.orders.map((o) => o.user)) + 1
  orderIds = orderIds || testCase.orders.map((_, i) => i)
  accounts =
    accounts ||
    (() => {
      const accounts = []
      for (let i = 0; i < userCount; i++) {
        accounts.push(`0x${i.toString(16).padStart(40, "0")}`)
      }
      return accounts
    })()

  assert(testCase.orders.length === orderIds.length, "missing orders in orderIds")
  assert(userCount <= accounts.length, "missing users in accounts")

  orderIds.forEach((o, i) => assert(BN.isBN(o) || Number.isInteger(o), `invalid order id at index ${i}`))
  accounts.forEach((a, i) => assert(typeof a === "string", `invalid account at index ${i}`))

  const usernames = accounts.map((a) => (a.length > 8 ? `${a.substr(0, 5)}…${a.substr(a.length - 3)}` : a))

  formatHeader("Orders")
  formatTable([
    ["Id", "User", "Buy Token", "Buy Amount", "Sell Token", "Sell Amount"],
    ...testCase.orders.map((o, i) => [orderIds[i], usernames[o.user], o.buyToken, o.buyAmount, o.sellToken, o.sellAmount]),
  ])
  formatHeader("Solutions")
  for (const solution of testCase.solutions) {
    formatSubHeader(solution.name || "???")
    formatTable([
      ["   Touched Tokens:           ", "Id", "Price", "Conservation"],
      ...solution.tokens.map((t) => ["", t.id, t.price, t.conservation]),
    ])
    formatTable([
      ["   Executed Orders:          ", "Id", "User", "Buy Amount", "Sell Amount", "Utility", "Disregarded Utility"],
      ...solution.orders.map((o) => ["", orderIds[o.idx], usernames[o.user], o.buy, o.sell, o.utility, o.disregardedUtility]),
    ])
    formatTable([
      ["   Total Utility:", solution.totalUtility],
      ["   Total Disregarded Utility:", solution.totalDisregardedUtility],
      ["   Burnt Fees:", solution.burntFees],
      ["   Objective Value:", solution.objectiveValue],
    ])
  }
}

/**
 * @typedef SolutionParam
 * @type {object}
 * @property {BN} objectiveValue The computed objective value for the solution
 * @property {string[]} owners The account addresses for thr order orners
 * @property {string[]} touchedorderIds The indices of touched orders
 * @property {BN[]} volumes The buy volumes
 * @property {BN[]} prices The prices of touched tokens
 * @property {number[]} tokenIdsForPrice The ids of the touched tokens
 */

/**
 * Generates `submitSolution` parameters for a given computed solution. Note
 * that this requires order indices as they are not known until runtime.
 * @param {ComputedSolution} solution The computed solution
 * @param {string[]} accounts The order indices as they are on the contract
 * @param {BN[]|number[]} orderIds The order indices as they are on the contract
 * @return {SolutionParams} The parameters to submit the solution
 */
function solutionSubmissionParams(solution, accounts, orderIds) {
  assert(Array.isArray(orderIds), "orderIds is not an array")
  assert(Array.isArray(accounts), "accounts is not an array")
  orderIds.forEach((o, i) => assert(BN.isBN(o) || Number.isInteger(o), `invalid order id at index ${i}`))
  accounts.forEach((a, i) => assert(typeof a === "string", `invalid account at index ${i}`))

  const orderCount = Math.max(...solution.orders.map((o) => o.idx)) + 1
  const userCount = Math.max(...solution.orders.map((o) => o.user)) + 1

  assert(orderCount <= orderIds.length, "missing orders in orderIds")
  assert(userCount <= accounts.length, "missing users in accounts")

  return {
    objectiveValue: solution.objectiveValue,
    owners: solution.orders.map((o) => accounts[o.user]),
    touchedorderIds: solution.orders.map((o) => orderIds[o.idx]),
    volumes: solution.orders.map((o) => o.buy),
    prices: solution.tokens.slice(1).map((t) => t.price),
    tokenIdsForPrice: solution.tokens.slice(1).map((t) => t.id),
  }
}

/**
 * Prints debug information for an objective value compuation.
 * @param {ObjectiveValueComputation} testCase The test case
 */
function debugObjectiveValueComputation(objectiveValue) {
  formatHeader("Executed Amounts")
  formatTable([["Order", "Buy", "Sell"], ...objectiveValue.orderExecutedAmounts.map(({ buy, sell }, i) => [i, buy, sell])])
  formatHeader("Token Conservation")
  formatTable([
    ["Order\\Token", ...objectiveValue.tokenConservation.map((_, i) => i)],
    ...objectiveValue.orderTokenConservation.map((o, i) => [i, ...o]),
    ["Total", ...objectiveValue.tokenConservation],
  ])
  formatHeader("Objective Value")
  formatTable([
    ["Order", ...objectiveValue.utilities.map((_, i) => i), "Total"],
    ["Utility", ...objectiveValue.utilities, objectiveValue.totalUtility],
    [
      "Disregarded Utility",
      ...[...objectiveValue.disregardedUtilities, objectiveValue.totalDisregardedUtility].map((du) => du.neg()),
    ],
    ["Burnt Fees", ...objectiveValue.utilities.map(() => ""), objectiveValue.burntFees],
    ["Result", ...objectiveValue.utilities.map(() => ""), objectiveValue.result],
  ])
}

/* eslint-disable no-console */

const formatHeader = (header) => console.log(`=== ${header} ===`)
const formatSubHeader = (header) => console.log(` - ${header}`)

function formatTable(table) {
  const [width, height] = [Math.max(...table.map((r) => r.length)), table.length]
  const getCell = (i, j) => {
    const cell = i < height ? table[i][j] : undefined
    return cell === undefined ? "" : cell === null ? "<NULL>" : `${cell}`
  }

  const columnWidths = []
  for (let j = 0; j < width; j++) {
    columnWidths.push(Math.max(...table.map((_, i) => getCell(i, j).length)) + 1)
  }

  for (let i = 0; i < height; i++) {
    const line = columnWidths.map((cw, j) => (j === 0 ? getCell(i, j).padEnd(cw) : getCell(i, j).padStart(cw))).join(" ")
    console.log(line)
  }
}

/* eslint-enable no-console */

module.exports = {
  generateTestCase,
  debugTestCase,
  debugObjectiveValueComputation,
  solutionSubmissionParams,
}
