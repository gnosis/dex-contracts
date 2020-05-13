/* eslint-disable no-console */

import { assert } from "chai";
import "mocha";
import Web3 from "web3";
import {
  BatchExchangeViewerArtifact,
  BatchExchangeViewer,
  ContractArtifact,
  IndexedOrder,
  StreamedOrderbook,
  deployment,
  getOpenOrders,
} from "../../../src";

describe("Streamed Orderbook", () => {
  describe("init", () => {
    it("should successfully apply all events and match on-chain orderbook", async function () {
      const {
        ETHEREUM_NODE_URL,
        INFURA_PROJECT_ID,
        ORDERBOOK_END_BLOCK,
        TEST_STREAMED_ORDERBOOK_E2E,
      } = process.env;
      if (!TEST_STREAMED_ORDERBOOK_E2E) {
        this.skip();
        return;
      }

      assert.isDefined(
        ETHEREUM_NODE_URL || INFURA_PROJECT_ID,
        "ETHEREUM_NODE_URL or INFURA_PROJECT_ID environment variable is required",
      );
      const url =
        ETHEREUM_NODE_URL ||
        `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;
      const endBlock = ORDERBOOK_END_BLOCK
        ? parseInt(ORDERBOOK_END_BLOCK)
        : undefined;

      const web3 = new Web3(url);
      const [viewer] = await deployment<BatchExchangeViewer>(
        web3,
        BatchExchangeViewerArtifact as ContractArtifact,
      );

      console.debug("==> building streamed orderbook...");
      const orderbook = await StreamedOrderbook.init(web3, {
        endBlock,
        strict: true,
      });
      const targetBlock = endBlock ?? (await orderbook.update());

      const streamedOrders = orderbook.getOpenOrders();

      console.debug("==> querying onchain orderbook...");
      const queriedOrders = (await getOpenOrders(viewer, 300, targetBlock)).map(
        (order) => ({
          ...order,
          sellTokenBalance: BigInt(order.sellTokenBalance.toString()),
          priceNumerator: BigInt(order.priceNumerator.toString()),
          priceDenominator: BigInt(order.priceDenominator.toString()),
          remainingAmount: BigInt(order.remainingAmount.toString()),
        }),
      );

      console.debug("==> comparing orderbooks...");
      function toDiffableOrders<T>(
        orders: IndexedOrder<T>[],
      ): Record<string, IndexedOrder<T>> {
        return orders.slice(0, 10).reduce((obj, order) => {
          const user = order.user.toLowerCase();
          obj[`${user}-${order.orderId}`] = { ...order, user };
          return obj;
        }, {} as Record<string, IndexedOrder<T>>);
      }
      assert.deepEqual(
        toDiffableOrders(streamedOrders),
        toDiffableOrders(queriedOrders),
      );
    }).timeout(0);
  });
});
