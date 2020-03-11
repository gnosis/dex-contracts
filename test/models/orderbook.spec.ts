import {Orderbook} from "../../src/orderbook";
import {assert} from "chai";
import "mocha";

describe("Orderbook", () => {
  it("cummulates bids and asks into sorted json", () => {
    const orderbook = new Orderbook("USDC", "DAI");
    orderbook.addAsk(1.1, 100);
    orderbook.addAsk(1.2, 200);
    orderbook.addAsk(1.01, 300);

    orderbook.addBid(0.9, 50);
    orderbook.addBid(0.99, 70);
    orderbook.addBid(0.9, 30);

    assert.equal(
      orderbook.toJSON(),
      JSON.stringify({
        bids: [
          [0.9, 80],
          [0.99, 70]
        ],
        asks: [
          [1.01, 300],
          [1.1, 100],
          [1.2, 200]
        ]
      })
    );
  });
});
