import BN from "bn.js";
import { Fraction } from "./fraction";

const max128 = new BN(2).pow(new BN(128)).subn(1);

/**
 * Modifies the price to work with ERC20 units
 * @param {number} price amount of quote token in exchange for one base token
 * @param {number} baseTokenDecimals number of decimals of the base token
 * @param {number} quoteTokenDecimals number of decimals of the quote token
 * @return {Fraction} fraction representing the amount of units of quote tokens in exchange for one unit of base token
 */
export function getUnitPrice(
  price: number,
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
): Fraction {
  return Fraction.fromNumber(price).mul(
    new Fraction(
      new BN(10).pow(new BN(quoteTokenDecimals)),
      new BN(10).pow(new BN(baseTokenDecimals)),
    ),
  );
}

/**
 * Computes the amount of output token units from their price and the amount of input token units
 * Note that the price is expressed in terms of tokens, while the amounts are in terms of token units
 * @param {number} price amount of quote token in exchange for one base token
 * @param {BN} baseTokenAmount amount of base token units that are exchanged at price
 * @param {number} baseTokenDecimals number of decimals of the base token
 * @param {number} quoteTokenDecimals number of decimals of the quote token
 * @return {BN} amount of output token units obtained
 */
export function getOutputAmountFromPrice(
  price: number,
  baseTokenAmount: BN,
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
): BN {
  const unitPriceFraction = getUnitPrice(
    price,
    baseTokenDecimals,
    quoteTokenDecimals,
  );
  const quoteTokenAmountFraction = unitPriceFraction.mul(
    new Fraction(baseTokenAmount, 1),
  );
  return quoteTokenAmountFraction.toBN();
}

/**
 * Computes the quote and base token amounts needed to set up an unlimited order in the exchange
 * @param {number} price amount of quote tokens in exchange for one base token
 * @param {number} baseTokenDecimals number of decimals of the base token
 * @param {number} quoteTokenDecimals number of decimals of the quote token
 * @return {BN[2]} amounts of quote token and base token for an unlimited order at the input price
 */
export function getUnlimitedOrderAmounts(
  price: number,
  baseTokenDecimals: number,
  quoteTokenDecimals: number,
): [BN, BN] {
  let baseTokenAmount = max128.clone();
  let quoteTokenAmount = getOutputAmountFromPrice(
    price,
    baseTokenAmount,
    baseTokenDecimals,
    quoteTokenDecimals,
  );
  if (quoteTokenAmount.gt(baseTokenAmount)) {
    quoteTokenAmount = max128.clone();
    baseTokenAmount = getOutputAmountFromPrice(
      1 / price,
      quoteTokenAmount,
      quoteTokenDecimals,
      baseTokenDecimals,
    );
    assert(
      quoteTokenAmount.gte(baseTokenAmount),
      "Error: unable to create unlimited order",
    );
  }
  return [baseTokenAmount, quoteTokenAmount];
}
