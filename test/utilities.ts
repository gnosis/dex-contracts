import BN from "bn.js";
import Web3 from "web3";
import { HttpProvider } from "web3-core";
import {
  EpochTokenLockerInstance,
  BatchExchangeInstance,
} from "../types/truffle-typings";
import { ContractArtifact } from "../src";
import { Deposit, Order } from "./resources/examples/model";

const jsonrpc = "2.0";
const id = 0;
const send = function <T>(
  method: string,
  params: T[],
  web3Provider: Web3,
): Promise<{}> {
  return new Promise(function (resolve, reject) {
    (web3Provider.currentProvider as HttpProvider).send(
      { id, jsonrpc, method, params },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );
  });
};

// Wait for n blocks to pass
/**
 * Wait for n (evm) seconds to pass
 * @param seconds - time to wait
 * @param web3Provider - potentially different in contract tests and system end-to-end testing.
 */
export async function waitForNSeconds(
  seconds: number,
  web3Provider = web3 as Web3,
): Promise<void> {
  await send("evm_increaseTime", [seconds], web3Provider);
  await send("evm_mine", [], web3Provider);
}

export async function closeAuction(
  instance: EpochTokenLockerInstance,
  web3Provider = web3 as Web3,
): Promise<void> {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch()
  ).toNumber();
  await waitForNSeconds(time_remaining + 1, web3Provider);
}

export async function sendTxAndGetReturnValue<T>(
  method: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendTransaction: (...args: any[]) => Promise<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: (...args: any[]) => Promise<T>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  const result = await method.call(...args);
  await method.sendTransaction(...args);
  return result;
}

/**
 * Finalizes user's pending deposits by updating user's balances for all input tokens.
 * It assumes no withdrawals have been requested.
 * State of the contract after the execution of this function for tokenAddress:
 * ```
 * balanceState[userAddress][tokenAddress] = {
 *   balance: pendingDepositAmount,
 *   pendingDeposits: null,
 *   pendingWithdraws: null,
 * }
 * ```
 * @param userAddress - address of the user who deposited
 * @param epochTokenLocker - instance of the epoch token locker to which the user deposited
 * @param tokenAddresses - list of token addresses for which a deposit is pending
 */
export async function applyBalances(
  userAddress: string,
  epochTokenLocker: EpochTokenLockerInstance,
  tokenAddresses: string[],
): Promise<void> {
  await closeAuction(epochTokenLocker);
  for (const tokenAddress of tokenAddresses) {
    await epochTokenLocker.withdraw(userAddress, tokenAddress);
  }
}

/**
 * Makes deposit transactions from a list of Deposit Objects
 * @param numTokens - number of tokens to be registered on this exchange.
 * @param maxTokens - Maximum number of tokens (a contract contructor parameter)
 */
export const setupGenericStableX = async function (
  numTokens = 2,
  maxTokens = 2 ** 16 - 1,
): Promise<BatchExchangeInstance> {
  const MockContract = artifacts.require("MockContract");
  const BatchExchange = artifacts.require("BatchExchange");

  const feeToken = await MockContract.new();
  await feeToken.givenAnyReturnBool(true);

  const instance = await BatchExchange.new(maxTokens, feeToken.address);
  const tokens = [feeToken];
  for (let i = 0; i < numTokens - 1; i++) {
    const token = await MockContract.new();
    await instance.addToken(token.address);
    await token.givenAnyReturnBool(true);
    tokens.push(token);
  }
  return instance;
};

/**
 * Makes deposit transactions from a list of Deposit Objects
 * @param contract - BatchExchange smart contract
 * @param accounts - An array of (unlocked) ethereum account addresses
 * @param depositList - Array of Deposit Objects
 * @param sufficiencyFactor - Factor of deposit amount to be deposited (default: 1)
 */
export async function makeDeposits(
  contract: BatchExchangeInstance,
  accounts: string[],
  depositList: Deposit[],
  sufficiencyFactor = 1,
): Promise<void> {
  for (const deposit of depositList) {
    const tokenAddress = await contract.tokenIdToAddressMap(deposit.token);
    await contract.deposit(
      tokenAddress,
      deposit.amount.muln(sufficiencyFactor),
      { from: accounts[deposit.user] },
    );
  }
}

/**
 * Makes placeOrder transactions from a list of Order Objects
 * @param contract - BatchExchange smart contract
 * @param accounts - An array of (unlocked) ethereum account addresses
 * @param orderList - An array of Order Objects
 * @param auctionIndex - The auction in which the order should be placed
 */
export async function placeOrders(
  contract: BatchExchangeInstance,
  accounts: string[],
  orderList: Order[],
  auctionIndex: number,
): Promise<number[]> {
  const orderIds: number[] = [];
  for (const order of orderList) {
    orderIds.push(
      (
        await sendTxAndGetReturnValue(
          contract.placeOrder,
          order.buyToken,
          order.sellToken,
          auctionIndex,
          order.buyAmount,
          order.sellAmount,
          { from: accounts[order.user] },
        )
      ).toNumber(),
    );
  }
  return orderIds;
}

export async function sendLiquidityOrders(
  instance: BatchExchangeInstance,
  tokenIds: number[],
  PRICE_FOR_LIQUIDITY_PROVISION: BN,
  SELL_ORDER_AMOUNT_OWL: BN,
  artifacts: ContractArtifact,
  OWL_NUMBER_DIGITS = 18,
): Promise<void> {
  const minBuyAmount = [];
  const validTokenIds = [];

  for (const tokenId of tokenIds) {
    const numberOfDigits = (
      await fetchTokenInfo(instance, [tokenId], artifacts)
    )[tokenId].decimals;
    if (numberOfDigits !== "UNKNOWN") {
      validTokenIds.push(tokenId);
      if (numberOfDigits < OWL_NUMBER_DIGITS) {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).div(
            new BN(10).pow(new BN(OWL_NUMBER_DIGITS - numberOfDigits)),
          ),
        );
      } else {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).mul(
            new BN(10).pow(new BN(numberOfDigits - OWL_NUMBER_DIGITS)),
          ),
        );
      }
    }
  }
  const numberOfOrders = validTokenIds.length;
  const batchId = (await instance.getCurrentBatchId()).toNumber();
  if (numberOfOrders == 0) {
    console.log(
      "No liquidity orders will be added, as all tokens have already received liquidity, or their decimals could not be determined",
    );
    return;
  }
  await instance.placeValidFromOrders(
    validTokenIds, //sellToken
    Array(numberOfOrders).fill(0), //buyToken
    Array(numberOfOrders).fill(batchId + 2), //validFrom
    Array(numberOfOrders).fill(maxUint32), //validTo
    minBuyAmount, //buyAmount
    Array(numberOfOrders).fill(SELL_ORDER_AMOUNT_OWL), //sellAmount
  );
  console.log(
    "Placed liquidity sell orders for the following tokens",
    await Promise.all(
      validTokenIds.map(
        async (i) => await instance.tokenIdToAddressMap.call(i),
      ),
    ),
  );
}
