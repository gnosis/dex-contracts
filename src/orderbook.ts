export class Price {
  numerator: number;
  denominator: number;

  constructor(numerator: number, denominator: number) {
    this.numerator = numerator;
    this.denominator = denominator;
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
  private asks: Map<number, Offer>;
  private bids: Map<number, Offer>;

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
