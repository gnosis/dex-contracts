import BN from "bn.js";
import { Fraction } from "./fraction";

const MAX128 = new BN(2).pow(new BN(128)).subn(1);

/**
 * Modifies the price to work with ERC20 units
 * @param price - Amount of quote token in exchange for one base token
 * @param baseTokenDecimals - Number of decimals of the base token
 * @param quoteTokenDecimals - Number of decimals of the quote token
 * @return Fraction representing the amount of units of quote tokens in exchange for one unit of base token
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
 * @param price - Amount of quote token in exchange for one base token
 * @param baseTokenAmount - Amount of base token units that are exchanged at price
 * @param baseTokenDecimals - Number of decimals of the base token
 * @param quoteTokenDecimals - Number of decimals of the quote token
 * @return Amount of output token units obtained
 */
export function getOutputAmountFromPrice(
  price: number,
  sellAmount: BN,
  sellTokenDecimals: number,
  buyTokenDecimals: number,
): BN {
  const unitPriceFraction = getUnitPrice(
    price,
    sellTokenDecimals,
    buyTokenDecimals,
  );
  const buyTokenAmountFraction = unitPriceFraction.mul(
    new Fraction(sellAmount, 1),
  );
  return buyTokenAmountFraction.toBN();
}

/**
 * Computes the quote and base token amounts needed to set up an unlimited order in the exchange
 * @param price - price of buy token in relative to one sell token
 * @param sellTokenDecimals - Number of decimals of the sell token
 * @param buyTokenDecimals - Number of decimals of the buy token
 * @return Amounts of sell-buy token for an unlimited order at the input price
 */
export function getUnlimitedOrderAmounts(
  price: number,
  sellTokenDecimals: number,
  buyTokenDecimals: number,
): [BN, BN] {
  let sellAmount = MAX128.clone();
  let buyAmount = getOutputAmountFromPrice(
    price,
    sellAmount,
    sellTokenDecimals,
    buyTokenDecimals,
  );
  if (buyAmount.gt(sellAmount)) {
    buyAmount = MAX128.clone();
    sellAmount = getOutputAmountFromPrice(
      1 / price,
      buyAmount,
      buyTokenDecimals,
      sellTokenDecimals,
    );
    assert(
      buyAmount.gte(sellAmount),
      "Error: unable to create unlimited order",
    );
  }
  return [sellAmount, buyAmount];
}
