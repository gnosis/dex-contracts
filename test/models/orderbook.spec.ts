import {Offer, Orderbook, Fraction} from "../../src/orderbook";
import {assert} from "chai";
import "mocha";

describe("Orderbook", () => {
  it("cummulates bids and asks sorted by best bid/best ask", () => {
    const orderbook = new Orderbook("USDC", "DAI");
    orderbook.addAsk(new Offer(new Fraction(11, 10), 100));
    orderbook.addAsk(new Offer(new Fraction(12, 10), 200));
    orderbook.addAsk(new Offer(new Fraction(101, 100), 300));

    orderbook.addBid(new Offer(new Fraction(9, 10), 50));
    orderbook.addBid(new Offer(new Fraction(99, 100), 70));
    orderbook.addBid(new Offer(new Fraction(9, 10), 30));

    assert.equal(orderbook.baseToken, "USDC");
    assert.equal(orderbook.quoteToken, "DAI");

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

  it("inverts by switching bid/asks and inverting prices", () => {
    const orderbook = new Orderbook("USDC", "DAI");

    // Offering to sell 100 USDC for 2 DAI each, thus willing to buy 200 DAI for 50ç each
    orderbook.addAsk(new Offer(new Fraction(2, 1), 100));
    orderbook.addAsk(new Offer(new Fraction(1, 1), 200));
    orderbook.addAsk(new Offer(new Fraction(4, 1), 300));

    // Offering to buy 50 USDC for 50ç each, thus willing to sell 25 DAI for 2 USDC each
    orderbook.addBid(new Offer(new Fraction(1, 2), 50));
    orderbook.addBid(new Offer(new Fraction(1, 4), 80));
    orderbook.addBid(new Offer(new Fraction(1, 4), 20));

    const inverse = orderbook.inverted();

    // Original didn't change
    assert.equal(orderbook.baseToken, "USDC");
    assert.equal(orderbook.quoteToken, "DAI");

    assert.equal(
      JSON.stringify(orderbook.toJSON()),
      JSON.stringify({
        bids: [
          {price: 0.5, volume: 50},
          {price: 0.25, volume: 100}
        ],
        asks: [
          {price: 1, volume: 200},
          {price: 2, volume: 100},
          {price: 4, volume: 300}
        ]
      })
    );

    // Check inverse
    assert.equal(inverse.baseToken, "DAI");
    assert.equal(inverse.quoteToken, "USDC");

    assert.equal(
      JSON.stringify(inverse.toJSON()),
      JSON.stringify({
        bids: [
          {price: 1, volume: 200},
          {price: 0.5, volume: 200},
          {price: 0.25, volume: 1200}
        ],
        asks: [
          {price: 2, volume: 25},
          {price: 4, volume: 25}
        ]
      })
    );
  });

  it("can add another orderbook by combining bids and asks", () => {
    const first_orderbook = new Orderbook("USDC", "DAI");
    first_orderbook.addAsk(new Offer(new Fraction(11, 10), 50));
    first_orderbook.addAsk(new Offer(new Fraction(12, 10), 150));
    first_orderbook.addBid(new Offer(new Fraction(9, 10), 50));
    first_orderbook.addBid(new Offer(new Fraction(99, 100), 80));

    const second_orderbook = new Orderbook("USDC", "DAI");
    second_orderbook.addAsk(new Offer(new Fraction(11, 10), 60));
    second_orderbook.addAsk(new Offer(new Fraction(13, 10), 200));
    second_orderbook.addBid(new Offer(new Fraction(9, 10), 50));
    second_orderbook.addBid(new Offer(new Fraction(95, 100), 70));

    first_orderbook.add(second_orderbook);

    assert.equal(
      JSON.stringify(first_orderbook.toJSON()),
      JSON.stringify({
        bids: [
          {price: 0.99, volume: 80},
          {price: 0.95, volume: 70},
          {price: 0.9, volume: 100}
        ],
        asks: [
          {price: 1.1, volume: 110},
          {price: 1.2, volume: 150},
          {price: 1.3, volume: 200}
        ]
      })
    );
  });

  it("cannot add orderbooks for different token pairs", () => {
    const first_orderbook = new Orderbook("DAI", "ETH");
    const second_orderbook = new Orderbook("DAI", "USDC");

    assert.throws(() => {
      first_orderbook.add(second_orderbook);
    });
  });

  it("Can compute the transitive closure of two orderbooks", () => {
    const first_orderbook = new Orderbook("ETH", "DAI");
    first_orderbook.addBid(new Offer(new Fraction(90, 1), 3));
    first_orderbook.addBid(new Offer(new Fraction(95, 1), 2));
    first_orderbook.addBid(new Offer(new Fraction(99, 1), 1));
    first_orderbook.addAsk(new Offer(new Fraction(101, 1), 2));
    first_orderbook.addAsk(new Offer(new Fraction(105, 1), 1));
    first_orderbook.addAsk(new Offer(new Fraction(110, 1), 3));

    const second_orderbook = new Orderbook("DAI", "USDC");
    second_orderbook.addBid(new Offer(new Fraction(99, 100), 100));
    second_orderbook.addBid(new Offer(new Fraction(9, 10), 200));
    second_orderbook.addAsk(new Offer(new Fraction(101, 100), 100));
    second_orderbook.addAsk(new Offer(new Fraction(105, 100), 200));

    const closure = first_orderbook.transitiveClosure(second_orderbook);

    assert.equal(closure.pair(), "ETH/USDC");
    assert.equal(
      JSON.stringify(closure.toJSON()),
      JSON.stringify({
        // The best bid eth_dai has enough liquidity on the best dai_usdc bid
        // with 1 DAI remaining to be matched from the second best eth_dai bid (190 DAI).
        // The remainder of the second best eth_dai bid (189 DAI) gets matched with the second
        // best dai_usdc bid (200 DAI), leaving 11 DAI for the worst eth_dai bid (270 DAI).
        // The remaining 259 DAI are unmatchable.
        bids: [
          {price: 98.01, volume: 1}, // best eth_dai * best dai_usdc
          {price: 94.05, volume: 1 / 95}, // 2nd best eth_dai * best dai_usdc (190 & 1 DAI remaining at 95 DAI/ETH)
          {price: 85.5, volume: 189 / 95}, // 2nd best eth_dai * 2nd best dai_usdc (189 & 200 DAI remaining at 95 DAI/ETH)
          {price: 81, volume: 11 / 90} // 3rd best eth_dai * 2nd best dai usdc (270 & 11 DAI remaining at 90 DAI/ETH)
        ],
        // The best ask eth_dai has more liquidity (202 DAI) than the best dai_usdc ask (100 DAI),
        // with 102 DAI remaining to be matched from the second best dai_usdc ask (200 DAI).
        // The remainder of the second best dai_usd ask (98 DAI) get matched with the second best
        // eth_dai ask (105 DAI), leaving 7 DAI + the third best eth_dai ask (330 DAI) unmatchable.
        asks: [
          {price: 102.01, volume: 100 / 101}, // best eth_dai * best dai_usdc
          {price: 106.05, volume: 102 / 101}, // best eth_dai * 2nd best dai_usdc
          {price: 110.25, volume: 98 / 105} // 2nd best eth_dai * 2nd best dai_usdc
        ]
      })
    );
  });

  it("cannot compute the transitive closure for non-transient orderbooks pairs", () => {
    const first_orderbook = new Orderbook("ETH", "DAI");
    const second_orderbook = new Orderbook("USDC", "TUSD");

    assert.throws(() => {
      first_orderbook.transitiveClosure(second_orderbook);
    });
  });
});
