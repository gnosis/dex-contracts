import { Fraction, FractionJson } from "./fraction";
import BN from "bn.js";

export class Offer {
  price: Fraction;
  volume: Fraction;

  constructor(price: Fraction, volume: number | Fraction) {
    if (typeof volume == "number") {
      this.volume = new Fraction(volume, 1);
    } else {
      this.volume = volume as Fraction;
    }
    this.price = price;
  }

  clone(): Offer {
    return new Offer(this.price.clone(), this.volume.clone());
  }

  static fromJSON(o: OfferJson): Offer {
    return new Offer(Fraction.fromJSON(o.price), Fraction.fromJSON(o.volume));
  }
}

export interface OfferJson {
  price: FractionJson;
  volume: FractionJson;
}

type Fee = { fee: Fraction };
type RemainingFractionAfterFee = { remainingFractionAfterFee: Fraction };

export class Orderbook {
  readonly baseToken: string;
  readonly quoteToken: string;
  readonly remainingFractionAfterFee: Fraction;
  private asks: Map<number, Offer>; // Mapping from price to cumulative offers at this point.
  private bids: Map<number, Offer>; // Mapping from price to cumulative offers at this point.

  constructor(
    baseToken: string,
    quoteToken: string,
    options: Fee | RemainingFractionAfterFee = { fee: new Fraction(1, 1000) },
  ) {
    this.baseToken = baseToken;
    this.quoteToken = quoteToken;
    if ("fee" in options) {
      this.remainingFractionAfterFee = new Fraction(1, 1).sub(options.fee);
    } else {
      this.remainingFractionAfterFee = options.remainingFractionAfterFee;
    }
    this.asks = new Map();
    this.bids = new Map();
  }

  getOffers(): { bids: Offer[]; asks: Offer[] } {
    const asks = Array.from(this.asks.values());
    const bids = Array.from(this.bids.values());
    asks.sort(sortOffersAscending);
    bids.sort(sortOffersDescending);
    return { bids, asks };
  }

  toJSON(): OrderbookToJson {
    return {
      baseToken: this.baseToken,
      quoteToken: this.quoteToken,
      remainingFractionAfterFee: this.remainingFractionAfterFee,
      asks: offersToJSON(this.asks),
      bids: offersToJSON(this.bids),
    };
  }

  static fromJSON(o: OrderbookJson): Orderbook {
    const remainingFractionAfterFee = Fraction.fromJSON(
      o.remainingFractionAfterFee,
    );
    const result = new Orderbook(o.baseToken, o.quoteToken, {
      remainingFractionAfterFee,
    });
    result.asks = offersFromJSON(o.asks);
    result.bids = offersFromJSON(o.bids);
    return result;
  }

  pair(): string {
    return `${this.baseToken}/${this.quoteToken}`;
  }

  addBid(bid: Offer): void {
    // For bids the effective price after fee becomes smaller
    const offer = new Offer(
      bid.price.mul(this.remainingFractionAfterFee),
      bid.volume.mul(this.remainingFractionAfterFee),
    );
    addOffer(offer, this.bids);
  }

  addAsk(ask: Offer): void {
    // For asks the effective price after fee becomes larger
    const offer = new Offer(
      ask.price.div(this.remainingFractionAfterFee),
      ask.volume.mul(this.remainingFractionAfterFee),
    );
    addOffer(offer, this.asks);
  }

  /**
   * @returns the inverse of the current order book (e.g. ETH/DAI becomes DAI/ETH)
   * by switching bids/asks and recomputing price/volume to the new reference token.
   */
  inverted(): Orderbook {
    const result = new Orderbook(this.quoteToken, this.baseToken, {
      fee: this.fee(),
    });
    result.bids = invertPricePoints(this.asks, this.remainingFractionAfterFee);
    result.asks = invertPricePoints(
      this.bids,
      this.remainingFractionAfterFee.inverted(),
    );

    return result;
  }

  /**
   * In-place adds the given orderbook to the current one, combining all bids and asks at the same price point
   * @param orderbook the orderbook to be added to this one
   */
  add(orderbook: Orderbook): void {
    if (orderbook.pair() != this.pair()) {
      throw new Error(
        `Cannot add ${orderbook.pair()} orderbook to ${this.pair()} orderbook`,
      );
    }
    orderbook.bids.forEach((bid) => {
      addOffer(bid, this.bids);
    });
    orderbook.asks.forEach((ask) => {
      addOffer(ask, this.asks);
    });
  }

  /**
   * @param amount the amount of base tokens to be sold
   * @return the price for which there are enough bids to fill the specified amount or undefined if there is not enough liquidity
   */
  priceToSellBaseToken(amount: number | BN): Fraction | undefined {
    const bids = Array.from(this.bids.values());
    bids.sort(sortOffersDescending);
    const price_before_fee = priceToCoverAmount(new Fraction(amount, 1), bids);
    // Price to sell base token after fee will be lower
    return price_before_fee?.mul(this.remainingFractionAfterFee);
  }

  /**
   * @param amount the amount of base tokens to be bought
   * @return the price for which there are enough asks to fill the specified amount or undefined if there is not enough liquidity
   */
  priceToBuyBaseToken(amount: number | BN): Fraction | undefined {
    const asks = Array.from(this.asks.values());
    asks.sort(sortOffersAscending);
    const price_before_fee = priceToCoverAmount(new Fraction(amount, 1), asks);
    // Price to buy base token after fee will be higher
    return price_before_fee?.div(this.remainingFractionAfterFee);
  }

  /**
   * Removes any overlapping bid/asks which could be matched in the current orderbook
   * @return A new instance of the orderbook with no more overlapping orders.
   */
  reduced(): Orderbook {
    const result = new Orderbook(this.baseToken, this.quoteToken);

    const bids = Array.from(this.bids.values());
    bids.sort(sortOffersDescending);
    const asks = Array.from(this.asks.values());
    asks.sort(sortOffersAscending);

    const bid_iterator = bids.values();
    const ask_iterator = asks.values();

    let best_bid = bid_iterator.next();
    let best_ask = ask_iterator.next();
    while (
      !(best_bid.done || best_ask.done) &&
      !best_bid.value.price.lt(best_ask.value.price)
    ) {
      // We have an overlapping bid/ask. Subtract the smaller from the larger and remove the smaller
      if (best_bid.value.volume.gt(best_ask.value.volume)) {
        best_bid.value = new Offer(
          best_bid.value.price,
          best_bid.value.volume.sub(best_ask.value.volume),
        );
        best_ask = ask_iterator.next();
      } else {
        best_ask.value = new Offer(
          best_ask.value.price,
          best_ask.value.volume.sub(best_bid.value.volume),
        );
        best_bid = bid_iterator.next();
        // In case the orders matched perfectly we will move ask as well
        if (best_ask.value.volume.isZero()) {
          best_ask = ask_iterator.next();
        }
      }
    }
    //Add remaining bids/asks to result
    while (!best_ask.done) {
      addOffer(best_ask.value, result.asks);
      best_ask = ask_iterator.next();
    }
    while (!best_bid.done) {
      addOffer(best_bid.value, result.bids);
      best_bid = bid_iterator.next();
    }
    return result;
  }

  /**
   * Computes the transitive closure of this orderbook (e.g. ETH/DAI) with another one (e.g. DAI/USDC).
   * Throws if the orderbooks cannot be combined (baseToken is not equal to quoteToken)
   * @param orderbook The orderbook for which the transitive closure will be computed
   * @returns A new instance of an orderbook representing the resulting closure.
   */
  transitiveClosure(orderbook: Orderbook): Orderbook {
    if (orderbook.baseToken != this.quoteToken) {
      throw new Error(
        `Cannot compute transitive closure of ${this.pair()} orderbook and ${orderbook.pair()} orderbook`,
      );
    }

    const ask_closure = this.transitiveAskClosure(orderbook);

    // Since bids are the asks of the inverted orderbook, computing transitive closure of bids is equivalent to
    // 1) inverting both orderbooks
    // 2) computing the transitive ask closure on the inverses
    // 3) re-inverting the result
    const bid_closure = orderbook
      .inverted()
      .transitiveAskClosure(this.inverted())
      .inverted();

    ask_closure.add(bid_closure);
    return ask_closure;
  }

  private transitiveAskClosure(orderbook: Orderbook): Orderbook {
    const result = new Orderbook(this.baseToken, orderbook.quoteToken, {
      fee: this.fee(),
    });

    // Create a copy here so original orders stay untouched
    const left_asks = Array.from(this.asks.values(), (o) => o.clone());
    const right_asks = Array.from(orderbook.asks.values(), (o) => o.clone());

    left_asks.sort(sortOffersAscending);
    right_asks.sort(sortOffersAscending);

    const left_iterator = left_asks.values();
    const right_iterator = right_asks.values();

    let right_next = right_iterator.next();
    let left_next = left_iterator.next();
    while (!(left_next.done || right_next.done)) {
      const right_offer = right_next.value;
      const left_offer = left_next.value;
      const price = left_offer.price.mul(right_offer.price);
      let volume;
      const right_offer_volume_in_left_offer_base_token = right_offer.volume.div(
        left_offer.price,
      );
      if (left_offer.volume.gt(right_offer_volume_in_left_offer_base_token)) {
        volume = right_offer_volume_in_left_offer_base_token;
        left_offer.volume = left_offer.volume.sub(volume);
        right_next = right_iterator.next();
      } else {
        volume = left_offer.volume;
        right_offer.volume = right_offer.volume.sub(
          volume.mul(left_offer.price),
        );
        left_next = left_iterator.next();
        // In case the orders matched perfectly we will move right as well
        if (right_offer.volume.isZero()) {
          right_next = right_iterator.next();
        }
      }
      addOffer(new Offer(price, volume), result.asks);
    }

    return result;
  }

  fee(): Fraction {
    return new Fraction(1, 1).sub(this.remainingFractionAfterFee);
  }

  clone(): Orderbook {
    const result = new Orderbook(this.baseToken, this.quoteToken, {
      fee: this.fee(),
    });
    this.bids.forEach((o) => addOffer(o, result.bids));
    this.asks.forEach((o) => addOffer(o, result.asks));
    return result;
  }
}

export interface OrderbookToJson {
  baseToken: string;
  quoteToken: string;
  remainingFractionAfterFee: Fraction;
  asks: Record<string, Offer>;
  bids: Record<string, Offer>;
}

export interface OrderbookJson {
  baseToken: string;
  quoteToken: string;
  remainingFractionAfterFee: FractionJson;
  asks: Record<string, OfferJson>;
  bids: Record<string, OfferJson>;
}

/**
 * Given a list of direct orderbooks this method returns the transitive orderbook
 * between two tokens by computing the transitive closure via a certain number of "hops".
 * @param direct_orderbooks the map direct (non-transitive) orderbooks between tokens
 * @param base the base token for which the transitive orderbook should be computed
 * @param quote the quote token for which the transitive orderbook should be computed
 * @param hops the number of intermediate tokens that should be considered when computing the transitive orderbook
 */
export function transitiveOrderbook(
  direct_orderbooks: Map<string, Orderbook>,
  base: string,
  quote: string,
  hops: number,
): Orderbook {
  const complete_orderbooks = new Map();
  direct_orderbooks.forEach((book) => {
    complete_orderbooks.set(book.pair(), book.clone());
    // If inverse pair doesn't exist we will create an empty one
    if (!direct_orderbooks.has(book.inverted().pair())) {
      const empty_book = new Orderbook(book.quoteToken, book.baseToken);
      complete_orderbooks.set(empty_book.pair(), empty_book);
    }
  });

  // Merge bid/ask orderbooks
  complete_orderbooks.forEach((book, pair) => {
    const inverse = book.inverted();
    const inverse_pair = inverse.pair();

    // Only update one of the two sides
    if (pair > inverse_pair) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      complete_orderbooks.get(inverse_pair)!.add(inverse);
      complete_orderbooks.set(
        pair,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        complete_orderbooks.get(inverse_pair)!.inverted(),
      );
    }
  });

  return transitiveOrderbookRecursive(
    complete_orderbooks,
    base,
    quote,
    hops,
    [],
  );
}

function transitiveOrderbookRecursive(
  orderbooks: Map<string, Orderbook>,
  base: string,
  quote: string,
  hops: number,
  ignore: string[],
): Orderbook {
  const result = new Orderbook(base, quote);
  // Add the direct book if it exists
  const orderbook = orderbooks.get(result.pair());
  if (orderbook) {
    result.add(orderbook);
  }

  if (hops === 0) {
    return result;
  }

  // Check for each orderbook that starts with same baseToken, if there exists a connecting book.
  // If yes, build transitive closure
  orderbooks.forEach((book) => {
    if (
      book.baseToken === base &&
      !(book.quoteToken === quote) &&
      !ignore.includes(book.quoteToken)
    ) {
      const otherBook = transitiveOrderbookRecursive(
        orderbooks,
        book.quoteToken,
        quote,
        hops - 1,
        ignore.concat(book.baseToken),
      );
      const closure = book.transitiveClosure(otherBook);
      result.add(closure);
    }
  });
  return result;
}

function addOffer(offer: Offer, existingOffers: Map<number, Offer>): void {
  const price = offer.price.toNumber();
  let current_offer_at_price;
  let current_volume_at_price = new Fraction(0, 1);
  if ((current_offer_at_price = existingOffers.get(price))) {
    current_volume_at_price = current_offer_at_price.volume;
  }
  existingOffers.set(
    price,
    new Offer(offer.price, offer.volume.add(current_volume_at_price)),
  );
}

function sortOffersAscending(left: Offer, right: Offer): number {
  if (left.price.gt(right.price)) {
    return 1;
  } else if (left.price.lt(right.price)) {
    return -1;
  } else {
    return 0;
  }
}

function sortOffersDescending(left: Offer, right: Offer): number {
  return sortOffersAscending(left, right) * -1;
}

function priceToCoverAmount(
  amount: Fraction,
  offers: Offer[],
): Fraction | undefined {
  for (const offer of offers) {
    if (offer.volume.lt(amount)) {
      amount = amount.sub(offer.volume);
    } else {
      return offer.price;
    }
  }
  return undefined;
}

function invertPricePoints(
  prices: Map<number, Offer>,
  priceAdjustmentForFee: Fraction,
): Map<number, Offer> {
  return new Map(
    Array.from(prices.entries()).map(([, offer]) => {
      const inverted_price = offer.price.inverted();
      const price_before_fee = offer.price.mul(priceAdjustmentForFee);
      const inverted_volume = offer.volume.mul(price_before_fee);
      return [
        inverted_price.toNumber(),
        new Offer(inverted_price, inverted_volume),
      ];
    }),
  );
}

function offersFromJSON(o: Record<string, OfferJson>): Map<number, Offer> {
  const offers = new Map();
  for (const [key, value] of Object.entries(o)) {
    offers.set(key, Offer.fromJSON(value));
  }
  return offers;
}

function offersToJSON(offers: Map<number, Offer>): Record<string, Offer> {
  const o: Record<string, Offer> = {};
  offers.forEach((value, key) => {
    o[key] = value;
  });
  return o;
}
