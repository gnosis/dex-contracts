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
  private asks: Map<number, Offer>; // Mapping from price to cummulative offers at this point.
  private bids: Map<number, Offer>; // Mapping from price to cummulative offers at this point.

  constructor(baseToken: string, quoteToken: string) {
    this.baseToken = baseToken;
    this.quoteToken = quoteToken;
    this.asks = new Map();
    this.bids = new Map();
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

  invert() {
    // Switch base/quote token
    const baseToken = this.baseToken;
    this.baseToken = this.quoteToken;
    this.quoteToken = baseToken;

    // Invert offers
    const bids = this.bids;
    this.bids = invertPricePoints(this.asks);
    this.asks = invertPricePoints(bids);
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
