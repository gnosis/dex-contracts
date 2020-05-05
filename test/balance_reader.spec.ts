import BN from "bn.js";

import {closeAuction, applyBalances} from "./utilities";
import {getBalanceState, getWithdrawableAmount} from "../src/balance_reader";

const MockContract = artifacts.require("MockContract");
const BatchExchange = artifacts.require("BatchExchange");

contract("BatchExchange utils", async (accounts) => {
  describe("getBalanceState()", async () => {
    it("retrieves balance as in storage", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);

      // amount is hex 100 to catch possible zero padding issues in the function
      await batchExchange.deposit(erc20.address, 0x100);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      const balance = await getBalanceState(
        accounts[0],
        erc20.address,
        batchExchange.address,
        web3
      );
      assert.equal(balance.toNumber(), 0x100);
    });
  });

  describe("getWithdrawableAmount()", async () => {
    const startingAmount = new BN("100");

    it("returns zero for future withdraw request", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, startingAmount);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      const futureBatchId = 2 ** 32 - 1;
      await batchExchange.requestFutureWithdraw(
        erc20.address,
        startingAmount,
        futureBatchId
      );
      const withdrawableAmount = await getWithdrawableAmount(
        accounts[0],
        erc20.address,
        batchExchange,
        web3
      );
      assert.equal(withdrawableAmount.toString(), "0");
    });

    it("returns amount when withdraw was already requested", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, startingAmount);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      await batchExchange.requestWithdraw(erc20.address, startingAmount);
      await closeAuction(batchExchange);
      const withdrawableAmount = await getWithdrawableAmount(
        accounts[0],
        erc20.address,
        batchExchange,
        web3
      );
      assert.equal(withdrawableAmount.toString(), startingAmount.toString());
      const transcript = await batchExchange.withdraw(
        accounts[0],
        erc20.address
      );
      assert.equal(
        withdrawableAmount.toString(),
        transcript.logs[0].args.amount.toString()
      );
    });

    it("returns entire balance when withdraw of more than available was requested", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, startingAmount);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      await batchExchange.requestWithdraw(
        erc20.address,
        startingAmount.addn(1)
      );
      await closeAuction(batchExchange);
      const withdrawableAmount = await getWithdrawableAmount(
        accounts[0],
        erc20.address,
        batchExchange,
        web3
      );
      assert.equal(withdrawableAmount.toString(), startingAmount.toString());
      const transcript = await batchExchange.withdraw(
        accounts[0],
        erc20.address
      );
      assert.equal(
        withdrawableAmount.toString(),
        transcript.logs[0].args.amount.toString()
      );
    });

    it("ignores deposits if funds are not yet available", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, startingAmount);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      const newAmount = new BN("200");
      const fullBalance = newAmount.add(startingAmount);
      await batchExchange.requestWithdraw(erc20.address, fullBalance);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, newAmount);
      const withdrawableAmount = await getWithdrawableAmount(
        accounts[0],
        erc20.address,
        batchExchange,
        web3
      );
      assert.equal(withdrawableAmount.toString(), startingAmount.toString());
      const transcript = await batchExchange.withdraw(
        accounts[0],
        erc20.address
      );
      assert.equal(
        withdrawableAmount.toString(),
        transcript.logs[0].args.amount.toString()
      );
    });

    it("considers deposits if funds are available", async () => {
      const erc20 = await MockContract.new();
      await erc20.givenAnyReturnBool(true);
      const batchExchange = await BatchExchange.new(1, erc20.address);
      await closeAuction(batchExchange);
      await batchExchange.deposit(erc20.address, startingAmount);
      await applyBalances(accounts[0], batchExchange, [erc20.address]);

      const newAmount = new BN("200");
      const fullBalance = newAmount.add(startingAmount);
      await batchExchange.requestWithdraw(erc20.address, fullBalance);
      await batchExchange.deposit(erc20.address, newAmount);
      await closeAuction(batchExchange);
      const withdrawableAmount = await getWithdrawableAmount(
        accounts[0],
        erc20.address,
        batchExchange,
        web3
      );
      assert.equal(withdrawableAmount.toString(), fullBalance.toString());
      const transcript = await batchExchange.withdraw(
        accounts[0],
        erc20.address
      );
      assert.equal(
        withdrawableAmount.toString(),
        transcript.logs[0].args.amount.toString()
      );
    });

    // untested case: lastCreditBatchId != 0
  });
});
