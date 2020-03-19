import {Order} from ".";
import {Fraction} from "./fraction";
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

  toJSON() {
    return {price: this.price, volume: this.volume};
  }
}

export class Orderbook {
  baseToken: string;
  quoteToken: string;
  private asks: Map<number, Offer>; // Mapping from price to cumulative offers at this point.
  private bids: Map<number, Offer>; // Mapping from price to cumulative offers at this point.

  constructor(baseToken: string, quoteToken: string) {
    this.baseToken = baseToken;
    this.quoteToken = quoteToken;
    this.asks = new Map();
    this.bids = new Map();
  }

  pair() {
    return `${this.baseToken}/${this.quoteToken}`;
  }

  addBid(bid: Offer) {
    addOffer(bid, this.bids);
  }

  addAsk(ask: Offer) {
    addOffer(ask, this.asks);
  }

  toJSON() {
    const asks = Array.from(this.asks.values());
    const bids = Array.from(this.bids.values());
    asks.sort(sortOffersAscending);
    bids.sort(sortOffersDescending);
    return {bids, asks};
  }

  /**
   * @returns the inverse of the current order book (e.g. ETH/DAI becomes DAI/ETH)
   * by switching bids/asks and recomputing price/volume to the new reference token.
   */
  inverted() {
    const result = new Orderbook(this.quoteToken, this.baseToken);
    result.bids = invertPricePoints(this.asks);
    result.asks = invertPricePoints(this.bids);

    return result;
  }

  /**
   * In-place adds the given orderbook to the current one, combining all bids and asks at the same price point
   * @param orderbook the orderbook to be added to this one
   */
  add(orderbook: Orderbook) {
    if (orderbook.pair() != this.pair()) {
      throw new Error(
        `Cannot add ${orderbook.pair()} orderbook to ${this.pair()} orderbook`
      );
    }
    orderbook.bids.forEach(bid => {
      this.addBid(bid);
    });
    orderbook.asks.forEach(ask => {
      this.addAsk(ask);
    });
  }

  /**
   * @param amount the amount of base tokens to be sold
   * @return the price for which there are enough bids to fill the specified amount or undefined if there is not enough liquidity
   */
  priceToSellBaseToken(amount: number | BN) {
    const bids = Array.from(this.bids.values());
    bids.sort(sortOffersDescending);
    return priceToCoverAmount(new Fraction(amount, 1), bids);
  }

  /**
   * @param amount the amount of base tokens to be bought
   * @return the price for which there are enough asks to fill the specified amount or undefined if there is not enough liquidity
   */
  priceToBuyBaseToken(amount: number | BN) {
    const asks = Array.from(this.asks.values());
    asks.sort(sortOffersAscending);
    return priceToCoverAmount(new Fraction(amount, 1), asks);
  }

  /**
   * Removes any overlapping bid/asks which could be matched in the current orderbook
   * @return A new instance of the orderbook with no more overlapping orders.
   */
  reduced() {
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
        best_bid.value.volume = best_bid.value.volume.sub(
          best_ask.value.volume
        );
        best_ask = ask_iterator.next();
      } else {
        best_ask.value.volume = best_ask.value.volume.sub(
          best_bid.value.volume
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
      result.addAsk(best_ask.value);
      best_ask = ask_iterator.next();
    }
    while (!best_bid.done) {
      result.addBid(best_bid.value);
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
  transitiveClosure(orderbook: Orderbook) {
    if (orderbook.baseToken != this.quoteToken) {
      throw new Error(
        `Cannot compute transitive closure of ${this.pair()} orderbook and ${orderbook.pair()} orderbook`
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

  private transitiveAskClosure(orderbook: Orderbook) {
    const result = new Orderbook(this.baseToken, orderbook.quoteToken);

    // Create a copy here so original orders stay untouched
    const left_asks = Array.from(this.asks.values());
    const right_asks = Array.from(orderbook.asks.values());

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
        left_offer.price
      );
      if (left_offer.volume.gt(right_offer_volume_in_left_offer_base_token)) {
        volume = right_offer_volume_in_left_offer_base_token;
        left_offer.volume = left_offer.volume.sub(volume);
        right_next = right_iterator.next();
      } else {
        volume = left_offer.volume;
        right_offer.volume = right_offer.volume.sub(
          volume.mul(left_offer.price)
        );
        left_next = left_iterator.next();
        // In case the orders matched perfectly we will move right as well
        if (right_offer.volume.isZero()) {
          right_next = right_iterator.next();
        }
      }
      result.addAsk(new Offer(price, volume));
    }

    return result;
  }
}

function addOffer(offer: Offer, existingOffers: Map<number, Offer>) {
  const price = offer.price.toNumber();
  let current_offer_at_price;
  let current_volume_at_price = new Fraction(0, 1);
  if ((current_offer_at_price = existingOffers.get(price))) {
    current_volume_at_price = current_offer_at_price.volume;
  }
  existingOffers.set(
    price,
    new Offer(offer.price, offer.volume.add(current_volume_at_price))
  );
}

function sortOffersAscending(left: Offer, right: Offer) {
  if (left.price.gt(right.price)) {
    return 1;
  } else if (left.price.lt(right.price)) {
    return -1;
  } else {
    return 0;
  }
}

function sortOffersDescending(left: Offer, right: Offer) {
  return sortOffersAscending(left, right) * -1;
}

function priceToCoverAmount(amount: Fraction, offers: Offer[]) {
  for (const offer of offers) {
    if (offer.volume.lt(amount)) {
      amount = amount.sub(offer.volume);
    } else {
      return offer.price;
    }
  }
  return undefined;
}

function invertPricePoints(prices: Map<number, Offer>) {
  return new Map(
    Array.from(prices.entries()).map(([_, offer]) => {
      const inverted_price = offer.price.inverted();
      const inverted_volume = offer.volume.mul(offer.price);
      return [
        inverted_price.toNumber(),
        new Offer(inverted_price, inverted_volume)
      ];
    })
  );
}
