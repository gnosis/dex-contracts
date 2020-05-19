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
const ZERO_BN = new BN(0);
const TEN_BN = new BN(10);
const MAX8 = new BN(2).pow(new BN(8)).subn(1);
const MAX256 = new BN(2).pow(new BN(256)).subn(1);

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

// TODO: Move this into a separate codebase with generic Ethereum Utils (ERC20 utils).
/**
 * A generalized version of "toWei" for ERC20 tokens with an arbitrary amount of decimals.
 * If the decimal representation has more decimals than the maximum amount possible, then the extra decimals are truncated.
 * @param amount - User-friendly representation for the amount of some ERC20 token
 * @param decimals - Maximum number of decimals of the token
 * Returns number of token units corresponding to the input amount
 */
const toErc20Units = function (
  amount: string,
  decimals: number | string | BN,
): BN {
  // The BN library handles the type conversion of decimals
  const bnDecimals = new BN(decimals);
  if (bnDecimals.lt(ZERO_BN) || bnDecimals.gte(MAX8))
    // ERC20 decimals is stored in a uint8
    throw Error(
      "Invalid number of decimals for ERC20 token: " + decimals.toString(),
    );
  decimals = bnDecimals.toNumber(); // safe conversion to num, since 0 <= decimals < 256  const re = /^(\d+)(\.(\d+))?$/ // a sequence of at least one digit (0-9), followed by optionally a dot and another sequence of at least one digit
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
  if (representation.gt(MAX256))
    throw Error("Number larger than ERC20 token maximum amount (uint256)");
  return representation;
};

describe.only("Amounts", () => {
  describe("getUnitPrice(price, buyTokenDecmials, sellTokenDecmials)", () => {
    const testCases = [
      {
        price: 1,
        buyTokenDecmials: 1,
        sellTokenDecmials: 1,
        expected: new Fraction(1, 1),
      },
      {
        price: 2,
        buyTokenDecmials: 1,
        sellTokenDecmials: 1,
        expected: new Fraction(2, 1),
      },
      {
        price: 150,
        buyTokenDecmials: 6,
        sellTokenDecmials: 18,
        expected: new Fraction(150000000000000, 1),
      },
      {
        price: 1 / 150,
        buyTokenDecmials: 6,
        sellTokenDecmials: 18,
        expected: new Fraction(1000000000000, 150),
      },
      {
        price: 150,
        buyTokenDecmials: 18,
        sellTokenDecmials: 6,
        expected: new Fraction(150, 1000000000000),
      },
      {
        price: 1 / 150,
        buyTokenDecmials: 18,
        sellTokenDecmials: 6,
        expected: new Fraction(1, 150000000000000),
      },
      {
        price: 0.00000000000001,
        buyTokenDecmials: 2,
        sellTokenDecmials: 6,
        expected: new Fraction(1, 10000000000),
      },
    ];
    for (const {
      price,
      sellTokenDecmials,
      buyTokenDecmials,
      expected,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${buyTokenDecmials}, ${sellTokenDecmials})`, () => {
        const unitPrice = getUnitPrice(
          price,
          buyTokenDecmials,
          sellTokenDecmials,
        );

        // Either the resulting fractions are identicall, or results are "essentiallyEqual"
        assert.isTrue(
          essentiallyEqual(unitPrice, expected),
          `${unitPrice.toNumber()} != ${expected.toNumber()}`,
        );
      });
    }
  });

  describe("getBuyAmountFromPrice(price, sellAmount, sellTokenDecmials, buyTokenDecmials)", () => {
    const testCases = [
      {
        price: 160,
        sellAmount: "1",
        sellTokenDecmials: 18,
        buyTokenDecmials: 6,
        expectedOutputString: "160",
      },
      {
        price: 1 / 160,
        sellAmount: "160",
        sellTokenDecmials: 6,
        buyTokenDecmials: 18,
        expectedOutputString: "1",
      },
      {
        price: 0.000125,
        sellAmount: "8000",
        sellTokenDecmials: 8,
        buyTokenDecmials: 18,
        expectedOutputString: "1",
      },
      {
        price: 10 ** 30,
        sellAmount: "0.000000000000000000000001", // 10**-24
        sellTokenDecmials: 100,
        buyTokenDecmials: 1,
        expectedOutputString: "1000000",
      },
      {
        price: 10.1,
        sellAmount: "1",
        sellTokenDecmials: 0,
        buyTokenDecmials: 70,
        expectedOutputString: "10.1",
      },
    ];
    for (const {
      price,
      sellAmount,
      sellTokenDecmials,
      buyTokenDecmials,
      expectedOutputString,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${sellAmount}, ${sellTokenDecmials}, ${buyTokenDecmials})`, () => {
        const inputAmount = toErc20Units(sellAmount, sellTokenDecmials);
        const expected = toErc20Units(expectedOutputString, buyTokenDecmials);
        const output = getBuyAmountFromPrice(
          price,
          inputAmount,
          sellTokenDecmials,
          buyTokenDecmials,
        );
        assert.isTrue(essentiallyEqual(output, expected));
      });
    }
  });

  describe("getUnlimitedOrderAmounts(price, sellTokenDecimals, buyTokenDecmials)", () => {
    const testCases = [
      {
        price: 160,
        buyTokenDecmials: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.divn(160),
      },
      {
        price: 1 / 160,
        buyTokenDecmials: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128.divn(160),
        expectedbaseAmount: MAX128,
      },
      {
        price: 1,
        buyTokenDecmials: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128,
      },
      {
        price: 1 + Number.EPSILON,
        buyTokenDecmials: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.sub(new BN(2).pow(new BN(128 - 52))),
      },
      {
        price: 1 - Number.EPSILON,
        buyTokenDecmials: 18,
        sellTokenDecimals: 18,
        expectedQuoteAmount: MAX128.sub(new BN(2).pow(new BN(128 - 52))),
        expectedbaseAmount: MAX128,
      },
      {
        price: 100,
        buyTokenDecmials: 165,
        sellTokenDecimals: 200,
        expectedQuoteAmount: MAX128.div(new BN(10).pow(new BN(200 - 165 - 2))),
        expectedbaseAmount: MAX128,
      },
      {
        price: 100,
        buyTokenDecmials: 200,
        sellTokenDecimals: 165,
        expectedQuoteAmount: MAX128,
        expectedbaseAmount: MAX128.div(new BN(10).pow(new BN(200 - 165 + 2))),
      },
    ];
    for (const {
      price,
      buyTokenDecmials,
      sellTokenDecimals,
      expectedQuoteAmount,
      expectedbaseAmount,
    } of testCases) {
      it(`evaluates as expected on input (${price}, ${sellTokenDecimals}, ${buyTokenDecmials})`, () => {
        const { base, quote } = getUnlimitedOrderAmounts(
          price,
          sellTokenDecimals,
          buyTokenDecmials,
        );
        assert.isTrue(essentiallyEqual(quote, expectedQuoteAmount));
        assert.isTrue(essentiallyEqual(base, expectedbaseAmount));
      });
    }
  });
});
