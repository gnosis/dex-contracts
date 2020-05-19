import BN from "bn.js";
import { Fraction } from "../fraction";

const MAX128 = new BN(2).pow(new BN(128)).subn(1);

type SellAmount = BN;
type BuyAmount = BN;

/**
 * Modifies the price to work with ERC20 units
 * @param price - Amount of buy token in exchange for one sell token
 * @param sellTokenDecimals - Number of decimals of the sell token
 * @param buyTokenDecimals - Number of decimals of the buy token
 * Returns Fraction representing the number of buy tokens in exchange for one unit of sell token
 */
export function getUnitPrice(
  price: number,
  sellTokenDecimals: number,
  buyTokenDecimals: number,
): Fraction {
  // assert(sellTokenDecimals > 0, "sell token decimals must be non-negative");
  // assert(buyTokenDecimals > 0, "buy token decimals must be non-negative");

  return Fraction.fromNumber(price).mul(
    new Fraction(
      new BN(10).pow(new BN(buyTokenDecimals)),
      new BN(10).pow(new BN(sellTokenDecimals)),
    ),
  );
}

/**
 * Computes the amount of output token units from their price and the amount of input token units
 * Note that the price is expressed in terms of tokens, while the amounts are in terms of token units
 * @param price - Amount of buy token in exchange for one sell token
 * @param sellAmount - Amount of sell token units that are exchanged at price
 * @param sellTokenDecimals - Number of decimals of the sell token
 * @param buyTokenDecimals - Number of decimals of the buy token
 * Returns amount of output token units obtained
 */
export function getBuyAmountFromPrice(
  price: number,
  sellAmount: BN,
  sellTokenDecimals: number,
  buyTokenDecimals: number,
): BuyAmount {
  const unitPrice = getUnitPrice(price, sellTokenDecimals, buyTokenDecimals);
  const buyAmount = unitPrice.mul(new Fraction(sellAmount, 1));
  return buyAmount.toBN();
}

/**
 * Computes the buy and sell token amounts required for an unlimited order in the exchange
 * @param price - Price of the buyToken relative to one sell token
 * @param sellTokenDecimals - Number of decimals of the sell token
 * @param buyTokenDecimals - Number of decimals of the buy token
 * Returns amounts of sell-buy token for an unlimited order at the input price
 */
export function getUnlimitedOrderAmounts(
  price: number,
  sellTokenDecimals: number,
  buyTokenDecimals: number,
): { base: SellAmount; quote: BuyAmount } {
  let sellAmount = MAX128.clone();
  let buyAmount = getBuyAmountFromPrice(
    price,
    sellAmount,
    sellTokenDecimals,
    buyTokenDecimals,
  );
  if (buyAmount.gt(sellAmount)) {
    buyAmount = MAX128.clone();
    sellAmount = getBuyAmountFromPrice(
      1 / price,
      buyAmount,
      buyTokenDecimals,
      sellTokenDecimals,
    );
    // assert(
    //   buyAmount.gte(sellAmount),
    //   "Error: unable to create unlimited order",
    // );
  }
  return { base: sellAmount, quote: buyAmount };
}
