import BN from "bn.js";
import Web3 from "web3";
import { HttpProvider } from "web3-core";
import {
  EpochTokenLockerInstance,
  BatchExchangeInstance,
} from "../types/truffle-typings";
import { TokenInfo } from "../src";
import { Deposit, Order } from "./resources/examples/model";

const MAXU32 = new BN(2).pow(new BN(32)).sub(new BN(1));

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

export async function fetchTokenInfoFromExchange(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  fallbackSymbolName = "UNKNOWN",
  fallbackDecimals = -1,
): Promise<Map<number, TokenInfo>> {
  const ERC20 = artifacts.require("ERC20Detailed");
  // Fetching token data from EVM
  const tokenObjects: Map<number, TokenInfo> = new Map();
  for (const id of tokenIds) {
    const tokenAddress = await exchange.tokenIdToAddressMap(id);
    let tokenInfo;
    try {
      const tokenInstance = await ERC20.at(tokenAddress);
      tokenInfo = {
        id: id,
        symbol: await tokenInstance.symbol.call(),
        decimals: (await tokenInstance.decimals.call()).toNumber(),
        address: tokenAddress,
      };
    } catch (err) {
      tokenInfo = {
        id: id,
        symbol: fallbackSymbolName,
        decimals: fallbackDecimals,
        address: tokenAddress,
      };
    }
    tokenObjects.set(id, tokenInfo);
    // Found Token ${tokenInfo.symbol} at ID ${tokenInfo.id} with ${tokenInfo.decimals} decimals`
  }
  return tokenObjects;
}

export async function sendLiquidityOrders(
  instance: BatchExchangeInstance,
  tokenIds: number[],
  PRICE_FOR_LIQUIDITY_PROVISION: BN,
  SELL_ORDER_AMOUNT_OWL: BN,
  OWL_NUMBER_DIGITS = 18,
): Promise<void> {
  const minBuyAmount = [];
  const validTokenIds = [];
  const tokenInfo = await fetchTokenInfoFromExchange(instance, tokenIds);
  for (const tokenId of tokenIds) {
    const numDigits = tokenInfo.get(tokenId)?.decimals;
    if (numDigits && numDigits != -1) {
      validTokenIds.push(tokenId);
      if (numDigits < OWL_NUMBER_DIGITS) {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).div(
            new BN(10).pow(new BN(OWL_NUMBER_DIGITS - numDigits)),
          ),
        );
      } else {
        minBuyAmount.push(
          SELL_ORDER_AMOUNT_OWL.mul(PRICE_FOR_LIQUIDITY_PROVISION).mul(
            new BN(10).pow(new BN(numDigits - OWL_NUMBER_DIGITS)),
          ),
        );
      }
    }
  }
  const numOrders = validTokenIds.length;
  const batchId = (await instance.getCurrentBatchId()).toNumber();
  if (numOrders == 0) {
    // No liquidity orders added, as all tokens sufficiently funded, or their decimals could not be determined",
    return;
  }
  await instance.placeValidFromOrders(
    validTokenIds, // sellToken
    Array(numOrders).fill(0), // buyToken
    Array(numOrders).fill(batchId + 2), // validFrom
    Array(numOrders).fill(MAXU32), // validTo
    minBuyAmount, // buyAmount
    Array(numOrders).fill(SELL_ORDER_AMOUNT_OWL), // sellAmount
  );
  // "Placed liquidity sell orders for the following tokens",
  // await Promise.all(
  //   validTokenIds.map(async (i) => await tokenInfo.get(i)?.address),
  // );
}
