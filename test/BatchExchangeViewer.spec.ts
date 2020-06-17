const BatchExchange = artifacts.require("BatchExchange");
const BatchExchangeViewer = artifacts.require("BatchExchangeViewer");
const MockContract = artifacts.require("MockContract");
const ERC20Detailed = artifacts.require("ERC20Detailed");

import { BatchExchangeViewer as BatchExchangeViewerContract } from "../build/types/BatchExchangeViewer";

import BN from "bn.js";
import truffleAssert from "truffle-assertions";

import { decodeOrders, decodeIndexedOrders } from "../src/encoding";
import { closeAuction, setupGenericStableX } from "./utilities";
import {
  MockContractInstance,
  BatchExchangeInstance,
} from "../build/truffle-typings";

const zero_address = "0x0000000000000000000000000000000000000000";

// The contract can't be profiled with solcover as we rely on invoking a staticcall with
// minimal gas amount (which gets burned in case the call fails). Coverage adds solidity
// instructions to determine which lines were touched which increases the amount of gas used.
contract("BatchExchangeViewer [ @skip-on-coverage ]", (accounts) => {
  const [user_1, user_2, user_3] = accounts;
  let batchExchange: BatchExchangeInstance,
    token_1: MockContractInstance,
    token_2: MockContractInstance;
  beforeEach(async () => {
    const feeToken = await MockContract.new();
    await feeToken.givenAnyReturnBool(true);
    batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address);

    token_1 = await MockContract.new();
    token_2 = await MockContract.new();
    await batchExchange.addToken(token_1.address);
    await batchExchange.addToken(token_2.address);
  });

  describe("getOpenOrderBook", () => {
    it("takes pending deposits and withdraws for the next batch into account", async () => {
      await token_2.givenAnyReturnBool(true);

      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(1, 2, batchId.addn(1), 200, 300);
      await batchExchange.deposit(token_2.address, 100);
      await batchExchange.requestWithdraw(token_2.address, 50);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(await viewer.getOpenOrderBook([]));
      assert.equal(result[0].sellTokenBalance.toNumber(), 50);
    });
    it("does not count already matured deposits twice", async () => {
      await token_2.givenAnyReturnBool(true);

      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(1, 2, batchId.addn(2), 200, 300);
      await batchExchange.deposit(token_2.address, 100);
      await batchExchange.requestWithdraw(token_2.address, 50);

      // Mature the pending withdraw
      await closeAuction(batchExchange);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(await viewer.getOpenOrderBook([]));
      assert.equal(result[0].sellTokenBalance.toNumber(), 50);
    });
    it("can be queried without pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId.addn(5)), //validFrom
        Array(10).fill(batchId.addn(5)), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(await viewer.getOpenOrderBook([]));
      assert.equal(result.filter((e) => batchId.eqn(e.validFrom)).length, 10);
    });
    it("can be queried with pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId.addn(5)), //validFrom
        Array(10).fill(batchId.addn(5)), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );

      const viewer = (await BatchExchangeViewer.new(batchExchange.address))
        .contract as BatchExchangeViewerContract;
      const result = await viewer.methods
        .getOpenOrderBookPaginated([], zero_address, 0, 5)
        .call();
      assert.equal(
        decodeIndexedOrders(result.elements).filter((e) =>
          batchId.eqn(e.validFrom),
        ).length,
        5,
      );
      assert.equal(result.nextPageUser, accounts[0]);
      assert.equal(result.nextPageUserOffset, "15");
    });
    it("can filter a token pair", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(3).fill(0), //buyToken
        Array(3).fill(1), //sellToken
        Array(3).fill(batchId), //validFrom
        Array(3).fill(batchId), //validTo
        Array(3).fill(0), //buyAmounts
        Array(3).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(5).fill(1), //buyToken
        Array(5).fill(2), //sellToken
        Array(5).fill(batchId), //validFrom
        Array(5).fill(batchId), //validTo
        Array(5).fill(0), //buyAmounts
        Array(5).fill(0), //sellAmounts
      );
      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(
        await viewer.getOpenOrderBook([token_1.address, token_2.address]),
      );
      assert.deepEqual(
        result.map((e) => e.orderId),
        [3, 4, 5, 6, 7],
      );
    });
  });

  describe("getFinalizedOrderBook", () => {
    it("ignores pending deposits and withdraws for the next batch", async () => {
      await token_2.givenAnyReturnBool(true);

      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(1, 2, batchId.addn(1), 200, 300);
      await closeAuction(batchExchange);

      await batchExchange.deposit(token_2.address, 100);
      await batchExchange.requestWithdraw(token_2.address, 50);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(
        await viewer.getFinalizedOrderBook([]),
      );
      assert.equal(result[0].sellTokenBalance.toNumber(), 0);
    });
    it("can be queried without pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId.addn(5)), //validFrom
        Array(10).fill(batchId.addn(5)), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );

      // finalize order book
      await closeAuction(batchExchange);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(
        await viewer.getFinalizedOrderBook([]),
      );
      assert.equal(result.filter((e) => batchId.eqn(e.validFrom)).length, 10);
    });
    it("can be queried with pagination", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId.addn(5)), //validFrom
        Array(10).fill(batchId.addn(5)), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(10).fill(1), //buyToken
        Array(10).fill(2), //sellToken
        Array(10).fill(batchId), //validFrom
        Array(10).fill(batchId), //validTo
        Array(10).fill(0), //buyAmounts
        Array(10).fill(0), //sellAmounts
      );

      // finalize order book
      await closeAuction(batchExchange);

      const viewer = (await BatchExchangeViewer.new(batchExchange.address))
        .contract as BatchExchangeViewerContract;
      const result = await viewer.methods
        .getFinalizedOrderBookPaginated([], zero_address, 0, 5)
        .call();
      assert.equal(
        decodeIndexedOrders(result.elements).filter((e) =>
          batchId.eqn(e.validFrom),
        ).length,
        5,
      );
      assert.equal(result.nextPageUser, accounts[0]);
      assert.equal(result.nextPageUserOffset, "15");
    });
    it("can filter a token pair", async () => {
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeValidFromOrders(
        Array(3).fill(0), //buyToken
        Array(3).fill(1), //sellToken
        Array(3).fill(batchId), //validFrom
        Array(3).fill(batchId), //validTo
        Array(3).fill(0), //buyAmounts
        Array(3).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(5).fill(1), //buyToken
        Array(5).fill(2), //sellToken
        Array(5).fill(batchId), //validFrom
        Array(5).fill(batchId), //validTo
        Array(5).fill(0), //buyAmounts
        Array(5).fill(0), //sellAmounts
      );

      // finalize order book
      await closeAuction(batchExchange);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = decodeIndexedOrders(
        await viewer.getFinalizedOrderBook([token_1.address, token_2.address]),
      );
      assert.deepEqual(
        result.map((e) => e.orderId),
        [3, 4, 5, 6, 7],
      );
    });
  });

  describe("getFilteredOrdersPaginated", () => [
    it("hasNextPage if pageSize is reached (regression)", async () => {
      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      await batchExchange.placeValidFromOrders(
        Array(3).fill(0), //buyToken
        Array(3).fill(1), //sellToken
        Array(3).fill(batchId), //validFrom
        Array(3).fill(batchId), //validTo
        Array(3).fill(0), //buyAmounts
        Array(3).fill(0), //sellAmounts
      );
      await batchExchange.placeValidFromOrders(
        Array(6).fill(1), //buyToken
        Array(6).fill(2), //sellToken
        Array(6).fill(batchId), //validFrom
        Array(6).fill(batchId), //validTo
        Array(6).fill(0), //buyAmounts
        Array(6).fill(0), //sellAmounts
      );
      const viewer = (await BatchExchangeViewer.new(batchExchange.address))
        .contract as BatchExchangeViewerContract;

      // We are querying two subpages which contain 6 elements in total, but due to our
      // page size constraint only return 5. Thus we should have a nextPage.
      const result = await viewer.methods
        .getFilteredOrdersPaginated(
          [batchId, batchId, batchId],
          [1, 2],
          zero_address,
          0,
          5,
        )
        .call();
      assert.equal(decodeIndexedOrders(result.elements).length, 5);
      assert.equal(result.hasNextPage, true);
    }),

    it("zeros the unfilted order page buffer for filtered tokens", async () => {
      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      const nextBatchId = batchId + 1;
      await batchExchange.placeValidFromOrders(
        Array(6).fill(0), //buyToken
        [1, 1, 1, 2, 2, 2], //sellToken
        Array(6).fill(batchId), //validFrom
        [
          nextBatchId,
          batchId,
          nextBatchId,
          nextBatchId,
          nextBatchId,
          nextBatchId,
        ], //validTo
        [0, 1, 2, 3, 4, 5], //buyAmounts
        Array(6).fill(0), //sellAmounts
      );
      const viewer = (await BatchExchangeViewer.new(batchExchange.address))
        .contract as BatchExchangeViewerContract;

      // We want to make sure that the orders with token ID 2 that should be
      // filtered indeed are. If the unfiltered order buffer was not getting
      // 0-ed when an order was filtered by token ID then the following request
      // would return 3 orders (the third one having duplicate data of first two
      // orders).
      const result = await viewer.methods
        .getFilteredOrdersPaginated(
          [batchId, nextBatchId, nextBatchId],
          [0, 1],
          zero_address,
          0,
          3,
        )
        .call();
      const orders = decodeIndexedOrders(result.elements);
      assert.equal(
        orders.length,
        2,
        `unexpected third order ${JSON.stringify(orders[2])}`,
      );
    }),
  ]);

  describe("getEncodedOrdersPaginated", async () => {
    it("returns empty bytes when no users", async () => {
      const batchExchange = await setupGenericStableX();
      const viewer = await BatchExchangeViewer.new(batchExchange.address);

      const auctionElements = await viewer.getEncodedOrdersPaginated(
        zero_address,
        0,
        10,
      );
      assert.equal(auctionElements, null);
    });
    it("returns three orders one per page", async () => {
      const batchExchange = await setupGenericStableX(3);
      const viewer = await BatchExchangeViewer.new(batchExchange.address);

      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_1,
      });
      await batchExchange.placeOrder(1, 2, batchId + 10, 100, 100, {
        from: user_1,
      });
      await batchExchange.placeOrder(0, 1, batchId + 10, 100, 100, {
        from: user_2,
      });

      const firstPage = decodeOrders(
        await viewer.getEncodedOrdersPaginated(zero_address, 0, 1),
      );
      assert.equal(
        JSON.stringify(firstPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ]),
      );

      const secondPage = decodeOrders(
        await viewer.getEncodedOrdersPaginated(user_1, 1, 1),
      );
      assert.equal(
        JSON.stringify(secondPage),
        JSON.stringify([
          {
            user: user_1.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 1,
            sellToken: 2,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ]),
      );

      const thirdPage = decodeOrders(
        await viewer.getEncodedOrdersPaginated(user_1, 2, 1),
      );
      assert.equal(
        JSON.stringify(thirdPage),
        JSON.stringify([
          {
            user: user_2.toLowerCase(),
            sellTokenBalance: new BN(0),
            buyToken: 0,
            sellToken: 1,
            validFrom: batchId,
            validUntil: batchId + 10,
            priceNumerator: new BN(100),
            priceDenominator: new BN(100),
            remainingAmount: new BN(100),
          },
        ]),
      );

      // 4th page is empty
      assert.equal(await viewer.getEncodedOrdersPaginated(user_2, 1, 1), null);
    });
    it("returns three orders when page size is overlapping users", async () => {
      const batchExchange = await setupGenericStableX(3);
      const viewer = await BatchExchangeViewer.new(batchExchange.address);

      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(0, 1, batchId.addn(10), 100, 100, {
        from: user_1,
      });
      await batchExchange.placeOrder(1, 2, batchId.addn(10), 100, 100, {
        from: user_1,
      });
      await batchExchange.placeOrder(0, 1, batchId.addn(10), 100, 100, {
        from: user_2,
      });

      const page = decodeOrders(
        await viewer.getEncodedOrdersPaginated(user_1, 1, 2),
      );
      assert.equal(page[0].user, user_1.toLowerCase());
      assert.equal(page[1].user, user_2.toLowerCase());
    });
    it("returns three orders from three users with larger page size", async () => {
      const batchExchange = await setupGenericStableX(3);
      const viewer = await BatchExchangeViewer.new(batchExchange.address);

      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(0, 1, batchId.addn(10), 100, 100, {
        from: user_1,
      });
      await batchExchange.placeOrder(1, 2, batchId.addn(10), 100, 100, {
        from: user_2,
      });
      await batchExchange.placeOrder(0, 1, batchId.addn(10), 100, 100, {
        from: user_3,
      });

      const page = decodeOrders(
        await viewer.getEncodedOrdersPaginated(zero_address, 0, 5),
      );
      assert.equal(page.length, 3);
      assert.equal(page[0].user, user_1.toLowerCase());
      assert.equal(page[1].user, user_2.toLowerCase());
      assert.equal(page[2].user, user_3.toLowerCase());
    });
  });
  describe("getEncodedOrdersPaginatedWithTokenFilter", () => {
    it("Does not query balance for filtered tokens", async () => {
      await token_1.givenAnyReturnBool(true);
      const batchId = await batchExchange.getCurrentBatchId();
      await batchExchange.placeOrder(2, 1, batchId.addn(10), 200, 300);
      await batchExchange.deposit(token_1.address, new BN(2).pow(new BN(255)));
      await closeAuction(batchExchange);
      // getBalance(token1) now reverts due to math overflow
      await batchExchange.deposit(token_1.address, new BN(2).pow(new BN(255)));
      await closeAuction(batchExchange);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      await truffleAssert.reverts(
        viewer.getEncodedOrdersPaginatedWithTokenFilter(
          [],
          zero_address,
          0,
          10,
        ),
      );
      const result = decodeOrders(
        await viewer.getEncodedOrdersPaginatedWithTokenFilter(
          [0, 2],
          zero_address,
          0,
          10,
        ),
      );
      // Filtered orders still show up as 0s to preserve order indices
      assert.equal(result.length, 1);
      assert.equal(result[0].validFrom, 0);
      assert.equal(result[0].validUntil, 0);
    });

    it("Allows filtered paginating while filtering (regression test)", async () => {
      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      await batchExchange.placeOrder(0, 1, batchId, 200, 300);
      await batchExchange.placeOrder(2, 1, batchId, 200, 300);

      const viewer = (await BatchExchangeViewer.new(batchExchange.address))
        .contract as BatchExchangeViewerContract;
      const result = await viewer.methods
        .getFilteredOrdersPaginated(
          [batchId, batchId, batchId],
          [1, 2],
          accounts[0],
          0,
          1,
        )
        .call();
      assert.equal(decodeIndexedOrders(result.elements).length, 1);
    });
  });
  describe("getTokenInfo", () => {
    it("Allows to get token address, symbol and decimals by ID", async () => {
      const erc20detailed = await ERC20Detailed.at(token_1.address);
      const symbolMethod = erc20detailed.contract.methods.symbol().encodeABI();
      const decimalsMethod = erc20detailed.contract.methods
        .decimals()
        .encodeABI();

      await token_1.givenMethodReturn(
        symbolMethod,
        web3.eth.abi.encodeParameter("string", "SCAM"),
      );
      await token_1.givenMethodReturnUint(decimalsMethod, 42);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      const result = await viewer.getTokenInfo(1);
      assert.equal(result[0], token_1.address);
      assert.equal(result[1], "SCAM");
      assert.equal(result[2].toNumber(), 42);
    });
    it("Reverts if token doesn't implement symbol or decimals", async () => {
      const erc20detailed = await ERC20Detailed.at(token_1.address);
      const symbolMethod = erc20detailed.contract.methods.symbol().encodeABI();
      await token_1.givenMethodRevert(symbolMethod);

      const decimalsMethod = erc20detailed.contract.methods
        .decimals()
        .encodeABI();
      await token_2.givenMethodRevert(decimalsMethod);

      const viewer = await BatchExchangeViewer.new(batchExchange.address);
      await truffleAssert.reverts(viewer.getTokenInfo(1));
      await truffleAssert.reverts(viewer.getTokenInfo(2));
    });
  });
});
