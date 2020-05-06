import { expect } from "chai";
import { BatchExchange } from "../../../src";
import { DEFAULT_ORDERBOOK_OPTIONS } from "../../../src/streamed";
import { AuctionState } from "../../../src/streamed/state";
import { AnyEvent, EventName, EventValues } from "../../../src/streamed/events";

function auctionState(): AuctionState {
  return new AuctionState({ ...DEFAULT_ORDERBOOK_OPTIONS, strict: true });
}

type Named<T> = Pick<T, keyof T & string>;

function event<
  K extends EventName<BatchExchange>,
  V extends BatchExchange["events"][K]
>(
  block: number,
  name: K,
  data: Named<EventValues<V>>,
  index = 0,
): AnyEvent<BatchExchange> {
  // NOTE: Cast to `any` as there are missing event data properties that the
  // account state doesn't care about.
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({} as any),
    event: name,
    blockNumber: block,
    returnValues: data,
    logIndex: index || 0,
  };
}

function addr(lowerBits: number): string {
  return `0x${lowerBits.toString(16).padStart(40, "0")}`;
}

describe("Account State", () => {
  describe("applyEventsUntilBatch", () => {
    it("Updates the batch ID", () => {
      const state = auctionState();
      state.applyEvents([
        event(0, "TokenListing", { id: "0", token: addr(1) }),
      ]);
      expect(state.nextBlock).to.equal(1);
    });

    it("Throws when past block is applied", () => {
      const state = auctionState();
      state.applyEvents([
        event(10, "TokenListing", { id: "0", token: addr(1) }),
      ]);
      expect(() =>
        state.applyEvents([
          event(1, "TokenListing", { id: "1", token: addr(1) }),
        ]),
      ).to.throw();
    });

    it("Throws when events are out of order", () => {
      const state = auctionState();
      expect(() =>
        state.applyEvents([
          event(2, "TokenListing", { id: "0", token: addr(1) }),
          event(1, "TokenListing", { id: "0", token: addr(1) }),
        ]),
      ).to.throw();
    });
  });

  describe("OrderPlacement > OrderCancellation > OrderDeletion", () => {
    it("Adds a new user orders", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(3),
            index: "0",
            buyToken: "0",
            sellToken: "1",
            validFrom: "2",
            validUntil: "99999",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          3,
        ),
      ]);
      expect(
        state.toJSON().accounts[addr(3)].orders[0].remainingAmount,
      ).to.equal("100000");
    });

    it("Sets the order valid until to null", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(3),
            index: "0",
            buyToken: "0",
            sellToken: "1",
            validFrom: "2",
            validUntil: "99999",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          3,
        ),
        event(3, "OrderCancellation", { owner: addr(3), id: "0" }),
      ]);
      expect(state.toJSON().accounts[addr(3)].orders[0].validUntil).to.be.null;
    });

    it("Completely clears values for deleted orders", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(3),
            index: "0",
            buyToken: "0",
            sellToken: "1",
            validFrom: "2",
            validUntil: "99999",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          3,
        ),
        event(3, "OrderCancellation", { owner: addr(3), id: "0" }),
        event(6, "OrderDeletion", { owner: addr(3), id: "0" }),
      ]);
      expect(state.toJSON().accounts[addr(3)].orders[0]).to.deep.equal({
        buyToken: 0,
        sellToken: 0,
        validFrom: 0,
        validUntil: 0,
        priceNumerator: "0",
        priceDenominator: "0",
        remainingAmount: "0",
      });
    });

    it("Throws for nonexistent order", () => {
      const state = auctionState();
      expect(() =>
        state.applyEvents([
          event(0, "OrderCancellation", { owner: addr(3), id: "0" }),
        ]),
      ).to.throw();

      expect(() =>
        state.applyEvents([
          event(0, "OrderDeletion", { owner: addr(3), id: "0" }),
        ]),
      ).to.throw();
    });
  });

  describe("Deposit", () => {
    it("Adds a user balance and updates it if already existing", () => {
      const state = auctionState();
      state.applyEvents([
        event(0, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
      ]);
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal(
        "100000",
      );

      state.applyEvents([
        event(1, "Deposit", {
          user: addr(1),
          token: addr(0),
          amount: "100000",
          batchId: "1",
        }),
      ]);
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal(
        "200000",
      );
    });
  });

  describe("Trade > SolutionSubmission > TradeReversion > SolutionReversion", () => {
    it("Updates balances and order amounts for solutions", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(
          1,
          "Deposit",
          {
            user: addr(0),
            token: addr(0),
            amount: "100000",
            batchId: "1",
          },
          3,
        ),
        event(
          1,
          "Deposit",
          {
            user: addr(1),
            token: addr(1),
            amount: "100000",
            batchId: "1",
          },
          4,
        ),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(0),
            index: "0",
            buyToken: "1",
            sellToken: "0",
            validFrom: "2",
            validUntil: "2",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          5,
        ),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(1),
            index: "0",
            buyToken: "0",
            sellToken: "1",
            validFrom: "2",
            validUntil: "2",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          6,
        ),
        event(
          2,
          "Trade",
          {
            owner: addr(0),
            orderId: "0",
            buyToken: "1",
            sellToken: "0",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          1,
        ),
        event(
          2,
          "Trade",
          {
            owner: addr(1),
            orderId: "0",
            buyToken: "0",
            sellToken: "1",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          2,
        ),
        event(
          2,
          "SolutionSubmission",
          {
            submitter: addr(2),
            burntFees: "10000",
            utility: "unused",
            disregardedUtility: "unused",
            lastAuctionBurntFees: "unsued",
            prices: ["unsued"],
            tokenIdsForPrice: ["unsued"],
          },
          3,
        ),
      ]);
      expect(state.toJSON().accounts[addr(0)].balances[addr(0)]).to.equal(
        "50000",
      );
      expect(state.toJSON().accounts[addr(0)].balances[addr(1)]).to.equal(
        "50000",
      );
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal(
        "50000",
      );
      expect(state.toJSON().accounts[addr(1)].balances[addr(1)]).to.equal(
        "50000",
      );
      expect(state.toJSON().accounts[addr(2)].balances[addr(0)]).to.equal(
        "10000",
      );
    });

    it("Reverts trades and solution", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
        event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
        event(
          1,
          "Deposit",
          {
            user: addr(0),
            token: addr(0),
            amount: "100000",
            batchId: "1",
          },
          3,
        ),
        event(
          1,
          "Deposit",
          {
            user: addr(1),
            token: addr(1),
            amount: "100000",
            batchId: "1",
          },
          4,
        ),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(0),
            index: "0",
            buyToken: "1",
            sellToken: "0",
            validFrom: "2",
            validUntil: "2",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          5,
        ),
        event(
          1,
          "OrderPlacement",
          {
            owner: addr(1),
            index: "0",
            buyToken: "0",
            sellToken: "1",
            validFrom: "2",
            validUntil: "2",
            priceNumerator: "100000",
            priceDenominator: "100000",
          },
          6,
        ),
        event(
          2,
          "Trade",
          {
            owner: addr(0),
            orderId: "0",
            buyToken: "1",
            sellToken: "0",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          1,
        ),
        event(
          2,
          "Trade",
          {
            owner: addr(1),
            orderId: "0",
            buyToken: "0",
            sellToken: "1",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          2,
        ),
        event(
          2,
          "SolutionSubmission",
          {
            submitter: addr(2),
            burntFees: "10000",
            utility: "unused",
            disregardedUtility: "unused",
            lastAuctionBurntFees: "unsued",
            prices: ["unsued"],
            tokenIdsForPrice: ["unsued"],
          },
          3,
        ),
        event(
          3,
          "TradeReversion",
          {
            owner: addr(0),
            orderId: "0",
            buyToken: "1",
            sellToken: "0",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          1,
        ),
        event(
          3,
          "TradeReversion",
          {
            owner: addr(1),
            orderId: "0",
            buyToken: "0",
            sellToken: "1",
            executedBuyAmount: "50000",
            executedSellAmount: "50000",
          },
          2,
        ),
      ]);
      expect(state.toJSON().accounts[addr(0)].balances[addr(0)]).to.equal(
        "100000",
      );
      expect(state.toJSON().accounts[addr(0)].balances[addr(1)]).to.equal("0");
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal("0");
      expect(state.toJSON().accounts[addr(1)].balances[addr(1)]).to.equal(
        "100000",
      );
      expect(state.toJSON().accounts[addr(2)].balances[addr(0)]).to.equal("0");
    });

    it("Throws if trades overdraw orders", () => {
      const state = auctionState();
      expect(() =>
        state.applyEvents([
          event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
          event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
          event(
            1,
            "Deposit",
            {
              user: addr(0),
              token: addr(0),
              amount: "100000",
              batchId: "1",
            },
            3,
          ),
          event(
            1,
            "Deposit",
            {
              user: addr(1),
              token: addr(1),
              amount: "200000",
              batchId: "1",
            },
            4,
          ),
          event(
            1,
            "OrderPlacement",
            {
              owner: addr(0),
              index: "0",
              buyToken: "1",
              sellToken: "0",
              validFrom: "2",
              validUntil: "2",
              priceNumerator: "100000",
              priceDenominator: "100000",
            },
            5,
          ),
          event(2, "Trade", {
            owner: addr(0),
            orderId: "0",
            buyToken: "1",
            sellToken: "0",
            executedBuyAmount: "200000",
            executedSellAmount: "200000",
          }),
        ]),
      ).to.throw();
    });

    it("Throws if solutions overdraw user balances", () => {
      const state = auctionState();
      expect(() =>
        state.applyEvents([
          event(1, "TokenListing", { id: "0", token: addr(0) }, 1),
          event(1, "TokenListing", { id: "1", token: addr(1) }, 2),
          event(
            1,
            "OrderPlacement",
            {
              owner: addr(0),
              index: "0",
              buyToken: "1",
              sellToken: "0",
              validFrom: "2",
              validUntil: "2",
              priceNumerator: "100000",
              priceDenominator: "100000",
            },
            5,
          ),
          event(
            2,
            "Trade",
            {
              owner: addr(0),
              orderId: "0",
              buyToken: "1",
              sellToken: "0",
              executedBuyAmount: "100000",
              executedSellAmount: "100000",
            },
            1,
          ),
          event(
            2,
            "SolutionSubmission",
            {
              submitter: addr(2),
              burntFees: "10000",
              utility: "unused",
              disregardedUtility: "unused",
              lastAuctionBurntFees: "unsued",
              prices: ["unsued"],
              tokenIdsForPrice: ["unsued"],
            },
            2,
          ),
        ]),
      ).to.throw();
    });
  });

  describe("WithdrawalRequest > Withdraw", () => {
    it("Adds a pending withdraw to the user", () => {
      const state = auctionState();
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
      ]);
      expect(
        state.toJSON().accounts[addr(1)].pendingWithdrawals[addr(0)],
      ).to.deep.equal({
        batchId: 1,
        amount: "100000",
      });
    });

    it("Updates balance on withdraw", () => {
      const state = auctionState();
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
      ]);
      expect(state.toJSON().accounts[addr(1)].balances[addr(0)]).to.equal(
        "50000",
      );
      expect(state.toJSON().accounts[addr(1)].pendingWithdrawals[addr(0)]).to.be
        .undefined;
    });

    it("Always works when withdrawing 0", () => {
      const state = auctionState();
      state.applyEvents([
        event(1, "Withdraw", {
          user: addr(1),
          token: addr(0),
          amount: "0",
        }),
      ]);
    });

    it("Throws when there is not enough balance", () => {
      const state = auctionState();
      expect(() =>
        state.applyEvents([
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
        ]),
      ).to.throw();
    });
  });
});
