import {Offer, Orderbook, Price} from "../../src/orderbook";
import {assert} from "chai";
import "mocha";

describe("Orderbook", () => {
  it("cummulates bids and asks sorted by best bid/best ask", () => {
    const orderbook = new Orderbook("USDC", "DAI");
    orderbook.addAsk(new Offer(new Price(11, 10), 100));
    orderbook.addAsk(new Offer(new Price(12, 10), 200));
    orderbook.addAsk(new Offer(new Price(101, 100), 300));

    orderbook.addBid(new Offer(new Price(9, 10), 50));
    orderbook.addBid(new Offer(new Price(99, 100), 70));
    orderbook.addBid(new Offer(new Price(9, 10), 30));

    assert.equal(
      JSON.stringify(orderbook.toJSON()),
      JSON.stringify({
        bids: [
          {price: 0.99, volume: 70},
          {price: 0.9, volume: 80}
        ],
        asks: [
          {price: 1.01, volume: 300},
          {price: 1.1, volume: 100},
          {price: 1.2, volume: 200}
        ]
      })
    );
  });
});
