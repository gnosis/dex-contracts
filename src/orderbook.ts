export class Orderbook {
  from: string;
  to: string;
  asks: Map<number, number>;
  bids: Map<number, number>;

  constructor(from: string, to: string) {
    this.from = from;
    this.to = to;
    this.asks = new Map();
    this.bids = new Map();
  }

  addBid(price: number, volume: number) {
    addOffer(price, volume, this.bids);
  }

  addAsk(price: number, volume: number) {
    addOffer(price, volume, this.asks);
  }

  toJSON(): string {
    const asks = Array.from(this.asks.entries());
    const bids = Array.from(this.bids.entries());
    asks.sort((lhs, rhs) => lhs[0] - rhs[0]);
    bids.sort((lhs, rhs) => lhs[0] - rhs[0]);
    return JSON.stringify({bids, asks});
  }
}

function addOffer(price: number, volume: number, map: Map<number, number>) {
  const current_volume_at_price = map.get(price) || 0;
  map.set(price, current_volume_at_price + volume);
}
