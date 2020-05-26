const BatchExchange = artifacts.require("BatchExchange");
const MockContract = artifacts.require("MockContract");
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap");
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet");

import BN from "bn.js";
import truffleAssert from "truffle-assertions";

import {
  solutionSubmissionParams,
  basicTrade,
  utilityOverflow,
} from "./resources/examples";
import {
  closeAuction,
  makeDeposits,
  placeOrders,
  setupGenericStableX,
} from "./utilities";
import { BatchExchangeInstance, Linkable } from "../types/truffle-typings";

contract("BatchExchange", async (accounts) => {
  const solver = accounts[0];

  before(async () => {
    const feeToken = await MockContract.new();
    await feeToken.givenAnyReturnBool(true);
    const lib1 = await IdToAddressBiMap.new();
    const lib2 = await IterableAppendOnlySet.new();
    await (BatchExchange as Linkable<BatchExchangeInstance>).link(
      "IdToAddressBiMap",
      lib1.address,
    );
    await (BatchExchange as Linkable<BatchExchangeInstance>).link(
      "IterableAppendOnlySet",
      lib2.address,
    );
  });

  // In the following tests, it might be possible that an batchId is read from the blockchain
  // and in the next moment this batchId is no longer the current one. In order to prevent these
  // situations, we set the adjust the start-time of each test to the start of an new auction.
  beforeEach(async () => {
    const batchExchange = await BatchExchange.deployed();
    await closeAuction(batchExchange);
  });

  describe("Regression Tests", async () => {
    it("Accepts large (> 2^128) utility evaluation", async () => {
      const batchExchange = await setupGenericStableX(3);

      await makeDeposits(batchExchange, accounts, utilityOverflow.deposits);
      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      const orderIds = await placeOrders(
        batchExchange,
        accounts,
        utilityOverflow.orders,
        batchId + 1,
      );
      await closeAuction(batchExchange);
      const solution = solutionSubmissionParams(
        utilityOverflow.solutions[0],
        accounts,
        orderIds,
      );

      const objectiveValue = await batchExchange.submitSolution.call(
        batchId,
        solution.objectiveValue,
        solution.owners,
        solution.touchedorderIds,
        solution.volumes,
        solution.prices,
        solution.tokenIdsForPrice,
        { from: solver },
      );
      assert(objectiveValue > new BN(2).pow(new BN(128)));
    });
    it("Should not allow to use claimable withdraws in solution", async () => {
      const batchExchange = await setupGenericStableX();

      await makeDeposits(batchExchange, accounts, basicTrade.deposits);
      const firstOrder = basicTrade.orders[0];
      const tokenAddress = await batchExchange.tokenIdToAddressMap(
        firstOrder.sellToken,
      );
      const attackerAddress = accounts[firstOrder.user];

      await batchExchange.requestWithdraw(tokenAddress, firstOrder.sellAmount, {
        from: attackerAddress,
      });
      await closeAuction(batchExchange);
      // Ensure withdraw is claimable.
      assert(
        await batchExchange.hasValidWithdrawRequest(
          attackerAddress,
          tokenAddress,
        ),
        "Expected valid withdraw request",
      );
      assert(
        (await batchExchange.getBalance(attackerAddress, tokenAddress)).eq(
          new BN(0),
        ),
      );

      const batchId = (await batchExchange.getCurrentBatchId()).toNumber();
      const orderIds = await placeOrders(
        batchExchange,
        accounts,
        basicTrade.orders,
        batchId + 1,
      );

      await closeAuction(batchExchange);
      const solution = solutionSubmissionParams(
        basicTrade.solutions[0],
        accounts,
        orderIds,
      );

      await truffleAssert.reverts(
        batchExchange.submitSolution.call(
          batchId,
          solution.objectiveValue,
          solution.owners,
          solution.touchedorderIds,
          solution.volumes,
          solution.prices,
          solution.tokenIdsForPrice,
          { from: solver },
        ),
        "Amount exceeds user's balance",
      );
    });
  });
});
