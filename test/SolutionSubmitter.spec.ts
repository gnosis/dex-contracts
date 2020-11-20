const ERC20 = artifacts.require("ERC20");
const GasToken = artifacts.require("GasToken");
const MockContract = artifacts.require("MockContract");
const SolutionSubmitter = artifacts.require("SolutionSubmitter");

import truffleAssert from "truffle-assertions";
import {
  closeAuction,
  makeDeposits,
  placeOrders,
  setupGenericStableX,
} from "./utilities";
import { solutionSubmissionParams, basicRingTrade } from "./resources/examples";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract("SolutionSubmitter", (accounts) => {
  const [owner, non_owner] = accounts;

  describe("execute", () => {
    it("allows arbitrary functions calls on behalf of instance from owner", async function () {
      const instance = await SolutionSubmitter.new(
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        0,
        { from: owner },
      );

      const mock = await MockContract.new();
      const mockedToken = await ERC20.at(mock.address);
      const transfer = mockedToken.contract.methods
        .transfer(owner, 100)
        .encodeABI();

      await instance.execute(mock.address, transfer, { from: owner });

      const invocationCount = await mock.invocationCountForMethod.call(
        transfer,
      );
      assert.equal(1, invocationCount.toNumber());
    });

    it("reverts functions calls from non-owner", async function () {
      const instance = await SolutionSubmitter.new(
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        0,
        { from: owner },
      );
      const mock = await MockContract.new();
      const mockedToken = await ERC20.at(mock.address);
      const transfer = mockedToken.contract.methods
        .transfer(owner, 100)
        .encodeABI();

      await truffleAssert.reverts(
        instance.execute(mock.address, transfer, { from: non_owner }),
      );
    });
  });

  describe("submit solution", () => {
    it("frees gas tokens to get ~50% of estimated gas", async () => {
      // Use real BatchExchange so we incur some significant gas costs
      const exchange = await setupGenericStableX(3);
      await makeDeposits(exchange, accounts, basicRingTrade.deposits);

      const batchId = (await exchange.getCurrentBatchId()).toNumber();
      const orderIds = await placeOrders(
        exchange,
        accounts,
        basicRingTrade.orders,
        batchId + 1,
      );

      await closeAuction(exchange);
      const solution = solutionSubmissionParams(
        basicRingTrade.solutions[0],
        accounts,
        orderIds,
      );
      const { prices, volumes } = solution;

      const gasTokenMock = await MockContract.new();
      const submitter = await SolutionSubmitter.new(
        exchange.address,
        gasTokenMock.address,
        0,
      );

      const call = submitter.contract.methods.submitSolution(
        batchId,
        solution.objectiveValue.toString(),
        solution.owners,
        solution.touchedorderIds,
        volumes.map((v) => v.toString()),
        prices.map((p) => p.toString()),
        solution.tokenIdsForPrice,
      );
      const estimate = await call.estimateGas();
      await call.send({ from: accounts[0], gas: estimate });

      // Each token refunds 24k gas and we can free up to half of the gas used
      const expectedTokenFreed = Math.ceil(estimate / 2 / 24000);

      const gasToken = await GasToken.at(gasTokenMock.address);
      const freeInvocation = gasToken.contract.methods
        .freeUpTo(expectedTokenFreed)
        .encodeABI();
      assert.equal(
        1,
        (
          await gasTokenMock.invocationCountForMethod.call(freeInvocation)
        ).toNumber(),
      );
    });

    it("respects gasThreshold", async () => {
      const exchange = await MockContract.new();
      const gasToken = await MockContract.new();
      const instance = await SolutionSubmitter.new(
        exchange.address,
        gasToken.address,
        100,
        { from: owner },
      );

      await instance.submitSolution(1, 1, [], [], [], [], [], {
        gasPrice: 50,
      });

      assert.equal(0, (await gasToken.invocationCount.call()).toNumber());
    });
  });
});
