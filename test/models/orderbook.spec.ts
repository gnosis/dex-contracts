import { Offer, Orderbook, transitiveOrderbook } from "../../src/orderbook"
import { Fraction } from "../../src/fraction"
import { assert } from "chai"
import "mocha"

function assertOffers(
  orderbook: Orderbook,
  bids: [number, number][],
  asks: [number, number][],
): void {
  const offers = orderbook.getOffers()
  assert.equal(offers.bids.length, bids.length, "bids length does not match")
  assert.equal(offers.asks.length, asks.length, "asks length does not match")
  for (let i = 0; i < offers.bids.length; i++) {
    assert.equal(offers.bids[i].price.toNumber(), bids[i][0], "bid price does not match")
    assert.equal(offers.bids[i].volume.toNumber(), bids[i][1], "bid volume does not match")
  }
  for (let i = 0; i < offers.asks.length; i++) {
    assert.equal(offers.asks[i].price.toNumber(), asks[i][0], "ask price does not match")
    assert.equal(offers.asks[i].volume.toNumber(), asks[i][1], "ask volume does not match")
  }
}

describe("Orderbook", () => {
  it("cummulates bids and asks sorted by best bid/best ask", () => {
    const orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
    orderbook.addAsk(new Offer(new Fraction(11, 10), 100))
    orderbook.addAsk(new Offer(new Fraction(12, 10), 200))
    orderbook.addAsk(new Offer(new Fraction(101, 100), 300))

    orderbook.addBid(new Offer(new Fraction(9, 10), 50))
    orderbook.addBid(new Offer(new Fraction(99, 100), 70))
    orderbook.addBid(new Offer(new Fraction(9, 10), 30))

    assert.equal(orderbook.baseToken, "USDC")
    assert.equal(orderbook.quoteToken, "DAI")

    assertOffers(orderbook, [[0.99, 70], [0.9, 80]], [[1.01, 300], [1.1, 100], [1.2, 200]])
  })

  describe("inverted", () => {
    it("inverts by switching bid/asks and inverting prices", () => {
      const orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })

      // Offering to sell 100 USDC for 2 DAI each, thus willing to buy 200 DAI for 50ç each
      orderbook.addAsk(new Offer(new Fraction(2, 1), 100))
      orderbook.addAsk(new Offer(new Fraction(1, 1), 200))
      orderbook.addAsk(new Offer(new Fraction(4, 1), 300))

      // Offering to buy 50 USDC for 50ç each, thus willing to sell 25 DAI for 2 USDC each
      orderbook.addBid(new Offer(new Fraction(1, 2), 50))
      orderbook.addBid(new Offer(new Fraction(1, 4), 80))
      orderbook.addBid(new Offer(new Fraction(1, 4), 20))

      const inverse = orderbook.inverted()

      // Original didn't change
      assert.equal(orderbook.baseToken, "USDC")
      assert.equal(orderbook.quoteToken, "DAI")
      assertOffers(orderbook, [[0.5, 50], [0.25, 100]], [[1, 200], [2, 100], [4, 300]])

      // Check inverse
      assert.equal(inverse.baseToken, "DAI")
      assert.equal(inverse.quoteToken, "USDC")
      assertOffers(inverse, [[1, 200], [0.5, 200], [0.25, 1200]], [[2, 25], [4, 25]])
    })

    it("does not mutate original orderbook", () => {
      const orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
      orderbook.addAsk(new Offer(new Fraction(2, 1), 100))
      orderbook.addBid(new Offer(new Fraction(1, 4), 20))

      const original_serialized = JSON.stringify(orderbook)
      orderbook.inverted()
      assert.equal(JSON.stringify(orderbook), original_serialized)
    })
  })

  describe("add", () => {
    it("can add another orderbook by combining bids and asks", () => {
      const first_orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
      first_orderbook.addAsk(new Offer(new Fraction(11, 10), 50))
      first_orderbook.addAsk(new Offer(new Fraction(12, 10), 150))
      first_orderbook.addBid(new Offer(new Fraction(9, 10), 50))
      first_orderbook.addBid(new Offer(new Fraction(99, 100), 80))

      const second_orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
      second_orderbook.addAsk(new Offer(new Fraction(11, 10), 60))
      second_orderbook.addAsk(new Offer(new Fraction(13, 10), 200))
      second_orderbook.addBid(new Offer(new Fraction(9, 10), 50))
      second_orderbook.addBid(new Offer(new Fraction(95, 100), 70))

      first_orderbook.add(second_orderbook)

      assertOffers(first_orderbook, [[0.99, 80], [0.95, 70], [0.9, 100]], [[1.1, 110], [1.2, 150], [1.3, 200]])
    })

    it("cannot add orderbooks for different token pairs", () => {
      const first_orderbook = new Orderbook("DAI", "ETH")
      const second_orderbook = new Orderbook("DAI", "USDC")

      assert.throws(() => {
        first_orderbook.add(second_orderbook)
      })
    })
  })
  describe("transitive closure", () => {
    it("Can compute the transitive closure of two orderbooks", () => {
      const first_orderbook = new Orderbook("ETH", "DAI", { fee: new Fraction(0, 1) })
      first_orderbook.addBid(new Offer(new Fraction(90, 1), 3))
      first_orderbook.addBid(new Offer(new Fraction(95, 1), 2))
      first_orderbook.addBid(new Offer(new Fraction(99, 1), 1))
      first_orderbook.addAsk(new Offer(new Fraction(101, 1), 2))
      first_orderbook.addAsk(new Offer(new Fraction(105, 1), 1))
      first_orderbook.addAsk(new Offer(new Fraction(110, 1), 3))

      const second_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
      second_orderbook.addBid(new Offer(new Fraction(99, 100), 100))
      second_orderbook.addBid(new Offer(new Fraction(9, 10), 200))
      second_orderbook.addAsk(new Offer(new Fraction(101, 100), 100))
      second_orderbook.addAsk(new Offer(new Fraction(105, 100), 200))

      const closure = first_orderbook.transitiveClosure(second_orderbook)

      assert.equal(closure.pair(), "ETH/USDC")
      assertOffers(closure,
        // with 1 DAI remaining to be matched from the second best eth_dai bid (190 DAI).
        // The remainder of the second best eth_dai bid (189 DAI) gets matched with the second
        // best dai_usdc bid (200 DAI), leaving 11 DAI for the worst eth_dai bid (270 DAI).
        // The remaining 259 DAI are unmatchable.
        [
          [98.01, 1], // best eth_dai * best dai_usdc
          [94.05, 1 / 95], // 2nd best eth_dai * best dai_usdc (190 & 1 DAI remaining at 95 DAI/ETH)
          [85.5, 189 / 95], // 2nd best eth_dai * 2nd best dai_usdc (189 & 200 DAI remaining at 95 DAI/ETH)
          [81, 11 / 90], // 3rd best eth_dai * 2nd best dai usdc (270 & 11 DAI remaining at 90 DAI/ETH)
        ],
        // The best ask eth_dai has more liquidity (202 DAI) than the best dai_usdc ask (100 DAI),
        // with 102 DAI remaining to be matched from the second best dai_usdc ask (200 DAI).
        // The remainder of the second best dai_usd ask (98 DAI) get matched with the second best
        // eth_dai ask (105 DAI), leaving 7 DAI + the third best eth_dai ask (330 DAI) unmatchable.
        [
          [102.01, 100 / 101], // best eth_dai * best dai_usdc
          [106.05, 102 / 101], // best eth_dai * 2nd best dai_usdc
          [110.25, 98 / 105], // 2nd best eth_dai * 2nd best dai_usdc
        ]
      )
    })

    it("does not modify the original orderbook when computing the closure", () => {
      const first_orderbook = new Orderbook("ETH", "DAI", { fee: new Fraction(0, 1) })
      first_orderbook.addBid(new Offer(new Fraction(90, 1), 3))
      first_orderbook.addBid(new Offer(new Fraction(95, 1), 2))
      first_orderbook.addBid(new Offer(new Fraction(99, 1), 1))
      first_orderbook.addAsk(new Offer(new Fraction(101, 1), 2))
      first_orderbook.addAsk(new Offer(new Fraction(105, 1), 1))
      first_orderbook.addAsk(new Offer(new Fraction(110, 1), 3))

      const second_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
      second_orderbook.addBid(new Offer(new Fraction(99, 100), 100))
      second_orderbook.addBid(new Offer(new Fraction(9, 10), 200))
      second_orderbook.addAsk(new Offer(new Fraction(101, 100), 100))
      second_orderbook.addAsk(new Offer(new Fraction(105, 100), 200))

      const first_serialized_original = JSON.stringify(first_orderbook)
      const second_serialized_original = JSON.stringify(second_orderbook)

      // Compute the closure
      first_orderbook.transitiveClosure(second_orderbook)

      assert.equal(JSON.stringify(first_orderbook), first_serialized_original)
      assert.equal(
        JSON.stringify(second_orderbook),
        second_serialized_original
      )
    })
  })

  it("cannot compute the transitive closure for non-transient orderbooks pairs", () => {
    const first_orderbook = new Orderbook("ETH", "DAI")
    const second_orderbook = new Orderbook("USDC", "TUSD")

    assert.throws(() => {
      first_orderbook.transitiveClosure(second_orderbook)
    })
  })

  describe("price estimation", () => {
    const orderbook = new Orderbook("ETH", "DAI", { fee: new Fraction(0, 1) })

    orderbook.addBid(new Offer(new Fraction(90, 1), 3))
    orderbook.addBid(new Offer(new Fraction(95, 1), 2))
    orderbook.addBid(new Offer(new Fraction(99, 1), 1))

    orderbook.addAsk(new Offer(new Fraction(101, 1), 2))
    orderbook.addAsk(new Offer(new Fraction(105, 1), 1))
    orderbook.addAsk(new Offer(new Fraction(110, 1), 3))

    it("returns best bid's price if bid volume is sufficient", () => {
      const price = orderbook.priceToSellBaseToken(1)
      assert.equal((price as Fraction).toNumber(), 99)
    })

    it("returns n-th bid's for which cumulative bid volume is sufficient", () => {
      const price = orderbook.priceToSellBaseToken(4)
      assert.equal((price as Fraction).toNumber(), 90)
    })

    it("returns undefined if there is not enough bid liquidity", () => {
      assert.isUndefined(orderbook.priceToSellBaseToken(7))
    })

    it("returns best asks's price if ask volume is sufficient", () => {
      const price = orderbook.priceToBuyBaseToken(1)
      assert.equal((price as Fraction).toNumber(), 101)
    })

    it("returns n-th bid's for which cumulative ask volume is sufficient", () => {
      const price = orderbook.priceToBuyBaseToken(4)
      assert.equal((price as Fraction).toNumber(), 110)
    })

    it("returns undefined if there is not enough ask liquidity", () => {
      assert.isUndefined(orderbook.priceToBuyBaseToken(7))
    })
  })

  describe("reduce", () => {
    it("returns an exact copy if orderbook is not overlapping", () => {
      const orderbook = new Orderbook("ETH", "DAI")

      orderbook.addBid(new Offer(new Fraction(95, 1), 2))
      orderbook.addBid(new Offer(new Fraction(99, 1), 1))
      orderbook.addAsk(new Offer(new Fraction(101, 1), 2))
      orderbook.addAsk(new Offer(new Fraction(105, 1), 1))

      assert.equal(
        JSON.stringify(orderbook.reduced().getOffers()),
        JSON.stringify(orderbook.getOffers())
      )
    })

    it("reduces partially overlapping orderbooks", () => {
      const orderbook = new Orderbook("ETH", "DAI", { fee: new Fraction(0, 1) })

      orderbook.addBid(new Offer(new Fraction(101, 1), 2))
      orderbook.addBid(new Offer(new Fraction(102, 1), 1))
      orderbook.addAsk(new Offer(new Fraction(101, 1), 2))
      orderbook.addAsk(new Offer(new Fraction(105, 1), 1))

      assertOffers(orderbook.reduced(), [[101, 1]], [[105, 1]])
    })

    it("reduces completely overlapping orderbooks", () => {
      const orderbook = new Orderbook("ETH", "DAI")

      orderbook.addBid(new Offer(new Fraction(101, 1), 2))
      orderbook.addBid(new Offer(new Fraction(105, 1), 1))
      orderbook.addAsk(new Offer(new Fraction(95, 1), 2))
      orderbook.addAsk(new Offer(new Fraction(99, 1), 1))

      assertOffers(orderbook.reduced(), [], [])
    })

    it("does not modify original orderbook", () => {
      const orderbook = new Orderbook("ETH", "DAI")

      orderbook.addBid(new Offer(new Fraction(102, 1), 1))
      orderbook.addAsk(new Offer(new Fraction(101, 1), 2))

      const original_serialized = JSON.stringify(orderbook.toJSON())
      orderbook.reduced()

      assert.equal(JSON.stringify(orderbook.toJSON()), original_serialized)
    })
  })

  describe("fee mechanism", () => {
    it("incorporates fee when asks/bids are added", () => {
      const orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(1, 100) })
      orderbook.addBid(new Offer(new Fraction(100, 1), 100))
      orderbook.addAsk(new Offer(new Fraction(200, 1), 200))

      // Spread gets larger and volumes decrease
      assertOffers(orderbook, [[99, 99]], [[200 / 0.99, 198]])

      const inverted = orderbook.inverted()
      assertOffers(inverted,
        // Inverse of 200 without fees is 0.005 becomes 0.00495 with fee
        [[0.00495, 39600]],
        // Inverse of 11 without fees is 0.01 becomes 0.0101... with fee
        [[0.01 / 0.99, 9900]])
    })

    it("Doesn't count fee twice when adding orderbooks", () => {
      const first_orderbook = new Orderbook(
        "USDC",
        "DAI",
        { fee: new Fraction(1, 100) }
      )
      first_orderbook.addBid(new Offer(new Fraction(100, 1), 100))

      const second_orderbook = new Orderbook(
        "USDC",
        "DAI",
        { fee: new Fraction(1, 100) }
      )
      second_orderbook.addBid(new Offer(new Fraction(100, 1), 100))
      first_orderbook.add(second_orderbook)

      assertOffers(first_orderbook, [[99, 198]], [])
    })

    it("Doesn't count fee twice when reducing orderbooks", () => {
      const orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(1, 100) })
      orderbook.addBid(new Offer(new Fraction(100, 1), 100))
      orderbook.addAsk(new Offer(new Fraction(200, 1), 200))

      const reduced = orderbook.reduced()
      assertOffers(reduced, [[99, 99]], [[200 / 0.99, 198]])
    })

    it("multiplies fee when building transitive closure", () => {
      const first_orderbook = new Orderbook(
        "USDC",
        "DAI",
        { fee: new Fraction(1, 100) }
      )
      first_orderbook.addBid(new Offer(new Fraction(1, 1), 100))

      const second_orderbook = new Orderbook(
        "DAI",
        "TUSD",
        { fee: new Fraction(1, 100) }
      )
      second_orderbook.addBid(new Offer(new Fraction(1, 1), 100))

      const closure = first_orderbook.transitiveClosure(second_orderbook)
      assertOffers(closure, [[0.99 * 0.99, 99]], [])
    })
  })

  describe("clone", () => {
    it("Make a deep copy of the original orderbook", () => {
      const orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
      orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

      const copy = orderbook.clone()
      assert.deepEqual(copy, orderbook)

      orderbook.addAsk(new Offer(new Fraction(1, 1), 100))
      assert.notDeepEqual(copy, orderbook)
    })
  })

  describe("serialize", () => {
    it("can be deserialized", () => {
      const original = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
      original.addAsk(new Offer(new Fraction(11, 10), 100))
      original.addAsk(new Offer(new Fraction(12, 10), 200))
      original.addAsk(new Offer(new Fraction(101, 100), 300))
      original.addBid(new Offer(new Fraction(9, 10), 50))
      original.addBid(new Offer(new Fraction(99, 100), 70))
      original.addBid(new Offer(new Fraction(9, 10), 30))

      const serialized = JSON.stringify(original)
      const deserialized = Orderbook.fromJSON(JSON.parse(serialized))
      assert.equal(JSON.stringify(original), JSON.stringify(deserialized))
    })
  })
})

describe("transitiveOrderbook", () => {
  it("computes transitive orderbook with 0 hops", () => {
    const orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
    orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

    const transitive = transitiveOrderbook(
      new Map([[orderbook.pair(), orderbook]]),
      "DAI",
      "USDC",
      0
    )

    assert.equal(JSON.stringify(orderbook.getOffers()), JSON.stringify(transitive.getOffers()))
  })

  it("computes transitive orderbook with 1 hop", () => {
    const direct = new Orderbook("DAI", "ETH", { fee: new Fraction(0, 1) })
    direct.addAsk(new Offer(new Fraction(1, 80), 80))

    const first_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
    first_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

    const second_orderbook = new Orderbook("USDC", "ETH", { fee: new Fraction(0, 1) })
    second_orderbook.addAsk(new Offer(new Fraction(1, 100), 100))

    const transitive = transitiveOrderbook(
      new Map([
        [direct.pair(), direct],
        [first_orderbook.pair(), first_orderbook],
        [second_orderbook.pair(), second_orderbook],
      ]),
      "DAI",
      "ETH",
      1
    )

    assertOffers(transitive, [], [[0.01, 100], [0.0125, 80]])
  })

  it("computes transitive orderbook with 2 hop", () => {
    const direct = new Orderbook("DAI", "ETH", { fee: new Fraction(0, 1) })
    direct.addAsk(new Offer(new Fraction(1, 80), 80))

    const first_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
    first_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

    const second_orderbook = new Orderbook("USDC", "USDT", { fee: new Fraction(0, 1) })
    second_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

    const third_orderbook = new Orderbook("USDT", "ETH", { fee: new Fraction(0, 1) })
    third_orderbook.addAsk(new Offer(new Fraction(1, 100), 100))

    const transitive = transitiveOrderbook(
      new Map([
        [direct.pair(), direct],
        [first_orderbook.pair(), first_orderbook],
        [second_orderbook.pair(), second_orderbook],
        [third_orderbook.pair(), third_orderbook],
      ]),
      "DAI",
      "ETH",
      2
    )

    assertOffers(transitive, [], [[0.01, 100], [0.0125, 80]])
  })

  it("computes transitive orderbook from bids and asks", () => {
    const first_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
    first_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))

    const second_orderbook = new Orderbook("ETH", "USDC", { fee: new Fraction(0, 1) })
    second_orderbook.addBid(new Offer(new Fraction(100, 1), 1))

    const transitive = transitiveOrderbook(
      new Map([
        [first_orderbook.pair(), first_orderbook],
        [second_orderbook.pair(), second_orderbook],
      ]),
      "DAI",
      "ETH",
      1
    )

    assertOffers(transitive, [], [[0.01, 100]])
  })

  it("does not modify the underlying orderbooks", () => {
    const direct = new Orderbook("DAI", "ETH", { fee: new Fraction(0, 1) })
    direct.addAsk(new Offer(new Fraction(1, 80), 80))
    const direct_serialized = JSON.stringify(direct)

    const first_orderbook = new Orderbook("DAI", "USDC", { fee: new Fraction(0, 1) })
    first_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))
    const first_serialized = JSON.stringify(first_orderbook)

    const second_orderbook = new Orderbook("USDC", "DAI", { fee: new Fraction(0, 1) })
    second_orderbook.addAsk(new Offer(new Fraction(1, 1), 100))
    const second_serialized = JSON.stringify(second_orderbook)

    const third_orderbook = new Orderbook("USDT", "ETH", { fee: new Fraction(0, 1) })
    third_orderbook.addAsk(new Offer(new Fraction(1, 100), 100))
    const third_serialized = JSON.stringify(third_orderbook)

    transitiveOrderbook(
      new Map([
        [direct.pair(), direct],
        [first_orderbook.pair(), first_orderbook],
        [second_orderbook.pair(), second_orderbook],
        [third_orderbook.pair(), third_orderbook],
      ]),
      "DAI",
      "ETH",
      2
    )

    assert.equal(JSON.stringify(direct), direct_serialized)
    assert.equal(JSON.stringify(first_orderbook), first_serialized)
    assert.equal(JSON.stringify(second_orderbook), second_serialized)
    assert.equal(JSON.stringify(third_orderbook), third_serialized)
  })
})
