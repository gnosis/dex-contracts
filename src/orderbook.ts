import {Order} from ".";

export class Price {
  numerator: number;
  denominator: number;

  constructor(numerator: number, denominator: number) {
    this.numerator = numerator;
    this.denominator = denominator;
  }

  inverted() {
    return new Price(this.denominator, this.numerator);
  }

  toNumber() {
    return this.numerator / this.denominator;
  }

  toJSON() {
    return this.toNumber();
  }
}

export class Offer {
  price: Price;
  volume: number;

  constructor(price: Price, volume: number) {
    this.volume = volume;
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
    bids.sort(sortOffersAscending);
    bids.reverse();
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
}

function addOffer(offer: Offer, existingOffers: Map<number, Offer>) {
  const price = offer.price.toNumber();
  let current_offer_at_price;
  let current_volume_at_price = 0;
  if ((current_offer_at_price = existingOffers.get(price))) {
    current_volume_at_price = current_offer_at_price.volume;
  }
  existingOffers.set(
    price,
    new Offer(offer.price, offer.volume + current_volume_at_price)
  );
}

function sortOffersAscending(left: Offer, right: Offer) {
  return left.price.toNumber() - right.price.toNumber();
}

function invertPricePoints(prices: Map<number, Offer>) {
  return new Map(
    Array.from(prices.entries()).map(([_, offer]) => {
      const inverted_price = offer.price.inverted();
      const inverted_volume = offer.volume * offer.price.toNumber();
      return [
        inverted_price.toNumber(),
        new Offer(inverted_price, inverted_volume)
      ];
    })
  );
}
