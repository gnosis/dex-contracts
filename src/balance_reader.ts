import BN from "bn.js";
import type Web3 from "web3";
import type { BatchExchangeInstance } from "../types/truffle-typings";

const WORD_DATA_LENGTH = 64;

/**
 * Retrieves user's token balance as stored in the "balance" entry of the private exchange mapping balanceStates
 * Value is directly read from storage relying on Solidity's layout of storage variables
 * See https://solidity.readthedocs.io/en/develop/internals/layout_in_storage.html
 * @param userAddress address of the user
 * @param tokenAddress address of the token
 * @param batchExchangeAddress address of the batch exchange
 * @param web3Provider provider of Ethereum JavaScript API
 * @return balance of the token for the given user as stored in balanceStates[userAddress][tokenAddress].balance
 */
export async function getBalanceState(
  userAddress: string,
  tokenAddress: string,
  batchExchangeAddress: string,
  web3Provider: Web3 = web3,
): Promise<BN> {
  // TODO when Truffle depends on web3-utils version ^1.2.5:
  // use soliditySha3Raw instead of soliditySha3 and remove type coercion
  const BALANCESTATES_STORAGE_SLOT = "0x0";

  const userBalancestatesStorageSlot = web3Provider.utils.soliditySha3(
    {
      type: "bytes32",
      value: web3Provider.utils.padLeft(userAddress, WORD_DATA_LENGTH),
    },
    {
      type: "bytes32",
      value: web3Provider.utils.padLeft(
        BALANCESTATES_STORAGE_SLOT,
        WORD_DATA_LENGTH,
      ),
    },
  ) as string;

  const targetStorageSlot = web3Provider.utils.soliditySha3(
    {
      type: "bytes32",
      value: web3Provider.utils.padLeft(tokenAddress, WORD_DATA_LENGTH),
    },
    {
      type: "bytes32",
      value: web3Provider.utils.padLeft(
        userBalancestatesStorageSlot,
        WORD_DATA_LENGTH,
      ),
    },
  ) as string;

  const storageAtSlot = await web3Provider.eth.getStorageAt(
    batchExchangeAddress,
    targetStorageSlot,
  );
  return web3Provider.utils.toBN(storageAtSlot);
}

/**
 * Computes amount of a token that a user can immediately withdraw from the exchange
 * It not only checks whether a withdrawal is pending, but also considers the balance available to the user,
 * pending deposits, and whether there were recent trades that would make withdrawing fail.
 * @param userAddress address of the user
 * @param tokenAddress address of the token
 * @param batchExchange object representing the batch exchange smart contract
 * @param web3Provider provider of Ethereum JavaScript API
 * @return amount of token that the user would receive by calling batchExchange.withdraw
 */
export async function getWithdrawableAmount(
  userAddress: string,
  tokenAddress: string,
  batchExchange: BatchExchangeInstance,
  web3Provider: Web3 = web3,
): Promise<BN> {
  const [
    balanceState,
    pendingDeposit,
    pendingWithdrawal,
    lastCreditBatchId,
    batchId,
  ] = await Promise.all([
    getBalanceState(
      userAddress,
      tokenAddress,
      batchExchange.address,
      web3Provider,
    ),
    batchExchange.getPendingDeposit(userAddress, tokenAddress),
    batchExchange.getPendingWithdraw(userAddress, tokenAddress),
    batchExchange.lastCreditBatchId(userAddress, tokenAddress),
    batchExchange.getCurrentBatchId(),
  ]);
  let balance = balanceState;
  if (pendingDeposit[1].lt(batchId)) {
    balance = balance.add(pendingDeposit[0]);
  }
  if (pendingWithdrawal[1].gte(batchId) || lastCreditBatchId.gte(batchId)) {
    return new BN(0);
  } else {
    return BN.min(balance, pendingWithdrawal[0]);
  }
}
