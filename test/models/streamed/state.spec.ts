import { expect } from "chai"
import { BatchExchange } from "../../../src"
import { DEFAULT_ORDERBOOK_OPTIONS } from "../../../src/streamed"
import { AuctionState } from "../../../src/streamed/state"
import { AnyEvent, EventName, EventValues } from "../../../src/streamed/events"

function auctionState(): AuctionState {
  return new AuctionState(
    { ...DEFAULT_ORDERBOOK_OPTIONS, strict: true },
  )
}

type Named<T> = Pick<T, keyof T & string>

function event<
  K extends EventName<BatchExchange>,
  V extends BatchExchange["events"][K],
>(
  block: number,
  name: K,
  data:  Named<EventValues<V>>,
  index: number = 0,
): AnyEvent<BatchExchange> {
  // NOTE: Cast to `any` as there are missing event data properties that the
  // account state doesn't care about.
  return {
    event: name,
    blockNumber: block,
    returnValues: data,
    logIndex: index || 0,
  } as any
}

function addr(lowerBits: number): string {
  return `0x${lowerBits.toString(16).padStart(40, "0")}`
}

describe("Account State", () => {
  describe("applyEventsUntilBatch", () => {
    it("Updates the batch ID", () => {
      const state = auctionState()
      state.applyEvents([
        event(0, "TokenListing", { id: "0", token: addr(1) }),
      ])
      expect(state.nextBlock).to.equal(1)
    })

    it("Throws when past block is applied", () => {
      const state = auctionState()
      state.applyEvents([
        event(10, "TokenListing", { id: "0", token: addr(1) }),
      ])
      expect(() => state.applyEvents([
        event(1, "TokenListing", { id: "1", token: addr(1) }),
      ])).to.throw()
    })

    it("Throws when events are out of order", () => {
      const state = auctionState()
      expect(() => state.applyEvents([
        event(2, "TokenListing", { id: "0", token: addr(1) }),
        event(1, "TokenListing", { id: "0", token: addr(1) }),
      ])).to.throw()
    })
  })

  describe("OrderPlacement > OrderCancellation > OrderDeletion", () => {
    it("Adds a new user orders", () => {
      const state = auctionState()
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(1, "OrderPlacement", {
          owner: addr(3),
          index: "0",
          buyToken: "0",
          sellToken: "1",
          validFrom: "2",
          validUntil: "99999",
          priceNumerator: "100000",
          priceDenominator: "100000",
        }, 3),
      ])
      expect(state.toJSON().accounts[addr(3)].orders[0].remainingAmount).to.equal("100000")
    })

    it("Sets the order valid until to null", () => {
      const state = auctionState()
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(1, "OrderPlacement", {
          owner: addr(3),
          index: "0",
          buyToken: "0",
          sellToken: "1",
          validFrom: "2",
          validUntil: "99999",
          priceNumerator: "100000",
          priceDenominator: "100000",
        }, 3),
        event(3, "OrderCancellation", { owner: addr(3), id: "0" }),
      ])
      expect(state.toJSON().accounts[addr(3)].orders[0].validUntil).to.be.null
    })

    it("Completely clears values for deleted orders", () => {
      const state = auctionState()
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(1, "OrderPlacement", {
          owner: addr(3),
          index: "0",
          buyToken: "0",
          sellToken: "1",
          validFrom: "2",
          validUntil: "99999",
          priceNumerator: "100000",
          priceDenominator: "100000",
        }, 3),
        event(3, "OrderCancellation", { owner: addr(3), id: "0" }),
        event(6, "OrderDeletion", { owner: addr(3), id: "0" }),
      ])
      expect(state.toJSON().accounts[addr(3)].orders[0]).to.deep.equal({
        buyToken: 0,
        sellToken: 0,
        validFrom: 0,
        validUntil: 0,
        priceNumerator: "0",
        priceDenominator: "0",
        remainingAmount: "0",
      })
    })

    it("Throws for nonexistent order", () => {
      const state = auctionState()
      expect(() => state.applyEvents([
        event(0, "OrderCancellation", { owner: addr(3), id: "0" }),
      ])).to.throw()

      expect(() => state.applyEvents([
        event(0, "OrderDeletion", { owner: addr(3), id: "0" }),
      ])).to.throw()
    })
  })

  describe("Deposit", () => {
    it("Adds a user balance and updates it if already existing", () => {
      const state = auctionState()
      state.applyEvents([
        event(0, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
      ])
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal("100000")

      state.applyEvents([
        event(1, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
      ])
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal("200000")
    })
  })

  describe("WithdrawalRequest > Withdraw", () => {
    it("Adds a pending withdraw to the user", () => {
      const state = auctionState()
      state.applyEvents([
        event(0, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
        event(1, "WithdrawRequest", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
      ])
      expect(state.toJSON().accounts[addr(1)].pendingWithdrawals[addr(0)]).to.deep.equal({
        batchId: 1,
        amount: "100000",
      })
    })

    it("Updates balance on withdraw", () => {
      const state = auctionState()
      state.applyEvents([
        event(0, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
        event(1, "WithdrawRequest", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
        event(2, "Withdraw", {
          user: addr(1),
          token: addr(0),
          amount: "50000",
        }),
      ])
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal("50000")
      expect(state.toJSON().accounts[addr(1)].pendingWithdrawals[addr(0)]).to.be.undefined
    })

    it("Always works when withdrawing 0", () => {
      const state = auctionState()
      state.applyEvents([
        event(1, "Withdraw", {
          user: addr(1),
          token: addr(0),
          amount: "0",
        }),
      ])
    })

    it("Throws when there is not enough balance", () => {
      const state = auctionState()
      expect(() => state.applyEvents([
        event(1, "WithdrawRequest", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "100",
        }),
        event(2, "Withdraw", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
        }),
      ])).to.throw()
    })
  })
})
