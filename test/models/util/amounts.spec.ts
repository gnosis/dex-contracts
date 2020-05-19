import {
  getUnitPrice,
  getBuyAmountFromPrice,
  getUnlimitedOrderAmounts,
} from "../../../src/util/amounts";
import { Fraction } from "../../../src/fraction";
import BN from "bn.js";
import { assert } from "chai";
import "mocha";

const MAX128 = new BN(2).pow(new BN(128)).subn(1);
const FLOAT_TOLERANCE = new BN(2).pow(new BN(52)); // This is float precision
const TEN_BN = new BN(10);

const essentiallyEqual = function (
  alpha: Fraction | BN,
  beta: Fraction | BN,
): boolean {
  if (alpha instanceof BN) {
    alpha = new Fraction(alpha, 1);
  }
  if (beta instanceof BN) {
    beta = new Fraction(beta, 1);
  }
  const difference = alpha.sub(beta).abs();
  return difference.mul(new Fraction(FLOAT_TOLERANCE, 1)).lt(beta);
};

/**
 * A generalized version of "toWei" for ERC20 tokens with an arbitrary amount of decimals.
 * If the decimal representation has more decimals than the maximum amount possible, then the extra decimals are truncated.
 * @param amount - User-friendly representation for the amount of some ERC20 token
 * @param decimals - Maximum number of decimals of the token
 * Returns number of token units corresponding to the input amount
 */
const toErc20Units = function (amount: string, decimals: number): BN {
  const re = /^(\d+)(\.(\d+))?$/; // a sequence of at least one digit (0-9), followed by optionally a dot and another sequence of at least one digit
  const match = re.exec(amount);
  if (match == null)
    throw Error("Failed to parse decimal representation of " + amount);
  const decimalString = (match[3] || "").padEnd(decimals, "0");
  if (decimalString.length != decimals)
    throw Error("Too many decimals for the token in input string");
  const integerPart = new BN(match[1]);
  const decimalPart = new BN(decimalString);
  const representation = integerPart
    .mul(TEN_BN.pow(new BN(decimals)))
    .add(decimalPart);
  return representation;
};

describe("Amounts", () => {
  describe("getUnitPrice(price, buyTokenDecimals, sellTokenDecimals)", () => {
    const testCases = [
      {
        price: 1,
        buyTokenDecimals: 1,
        sellTokenDecimals: 1,
        expected: new Fraction(1, 1),
      },
      {
        price: 2,
        buyTokenDecimals: 1,
        sellTokenDecimals: 1,
        expected: new Fraction(2, 1),
      },
      {
        price: 150,
        buyTokenDecimals: 6,
        sellTokenDecimals: 18,
        expected: new Fraction(150000000000000, 1),
      },
      {
        price: 1 / 150,
        buyTokenDecimals: 6,
        sellTokenDecimals: 18,
        expected: new Fraction(1000000000000, 150),
      },
      {
        price: 150,
        buyTokenDecimals: 18,
        sellTokenDecimals: 6,
        expected: new Fraction(150, 1000000000000),
      },
      {
        price: 1 / 150,
        buyTokenDecimals: 18,
        sellTokenDecimals: 6,
        expected: new Fraction(1, 150000000000000),
      },
      {
        price: 0.00000000000001,
        buyTokenDecimals: 2,
        sellTokenDecimals: 6,
        expected: new Fraction(1, 10000000000),
      },
    ];
    for (const {
      price,
      sellTokenDecimals,
      buyTokenDecimals,
      expected,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${buyTokenDecimals}, ${sellTokenDecimals})`, () => {
        const unitPrice = getUnitPrice(
          price,
          buyTokenDecimals,
          sellTokenDecimals,
        );

        // Either the resulting fractions are identicall, or results are "essentiallyEqual"
        assert.isTrue(
          essentiallyEqual(unitPrice, expected),
          `${unitPrice.toNumber()} != ${expected.toNumber()}`,
        );
      });
    }
  });

  describe("getBuyAmountFromPrice(price, sellAmount, sellTokenDecimals, buyTokenDecimals)", () => {
    const testCases = [
      {
        price: 160,
        sellAmount: "1",
        sellTokenDecimals: 18,
        buyTokenDecimals: 6,
        expectedOutputString: "160",
      },
      {
        price: 1 / 160,
        sellAmount: "160",
        sellTokenDecimals: 6,
        buyTokenDecimals: 18,
        expectedOutputString: "1",
      },
      {
        price: 0.000125,
        sellAmount: "8000",
        sellTokenDecimals: 8,
        buyTokenDecimals: 18,
        expectedOutputString: "1",
      },
      {
        price: 10 ** 30,
        sellAmount: "0.000000000000000000000001", // 10**-24
        sellTokenDecimals: 100,
        buyTokenDecimals: 1,
        expectedOutputString: "1000000",
      },
      {
        price: 10.1,
        sellAmount: "1",
        sellTokenDecimals: 0,
        buyTokenDecimals: 70,
        expectedOutputString: "10.1",
      },
    ];
    for (const {
      price,
      sellAmount,
      sellTokenDecimals,
      buyTokenDecimals,
      expectedOutputString,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${sellAmount}, ${sellTokenDecimals}, ${buyTokenDecimals})`, () => {
        const inputAmount = toErc20Units(sellAmount, sellTokenDecimals);
        const expected = toErc20Units(expectedOutputString, buyTokenDecimals);
        const output = getBuyAmountFromPrice(
          price,
          inputAmount,
          sellTokenDecimals,
          buyTokenDecimals,
        );
        assert.isTrue(essentiallyEqual(output, expected));
      });
    }
  });

  describe("getUnlimitedOrderAmounts(price, sellTokenDecimals, buyTokenDecimals)", () => {
    const testCases = [
      {
        price: 160,
        buyTokenDecimals: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.divn(160),
      },
      {
        price: 1 / 160,
        buyTokenDecimals: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128.divn(160),
        expectedbaseAmount: MAX128,
      },
      {
        price: 1,
        buyTokenDecimals: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128,
      },
      {
        price: 1 + Number.EPSILON,
        buyTokenDecimals: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.sub(new BN(2).pow(new BN(128 - 52))),
      },
      {
        price: 1 - Number.EPSILON,
        buyTokenDecimals: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128.sub(new BN(2).pow(new BN(128 - 52))),
        expectedbaseAmount: MAX128,
      },
      {
        price: 100,
        buyTokenDecimals: 165,
        sellTokenDecimals: 200,
        expectedQuoteAmount: MAX128.div(new BN(10).pow(new BN(200 - 165 - 2))),
        expectedbaseAmount: MAX128,
      },
      {
        price: 100,
        buyTokenDecimals: 200,
        sellTokenDecimals: 165,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.div(new BN(10).pow(new BN(200 - 165 + 2))),
      },
    ];
    for (const {
      price,
      buyTokenDecimals,
      sellTokenDecimals,
      expectedQuoteAmount,
      expectedbaseAmount,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${sellTokenDecimals}, ${buyTokenDecimals})`, () => {
        const { base, quote } = getUnlimitedOrderAmounts(
          price,
          sellTokenDecimals,
          buyTokenDecimals,
        );
        assert.isTrue(essentiallyEqual(quote, expectedQuoteAmount));
        assert.isTrue(essentiallyEqual(base, expectedbaseAmount));
      });
    }
  });
});
