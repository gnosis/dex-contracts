import Web3 from "web3"
import { HttpProvider } from "web3-core"
import { EpochTokenLockerInstance } from "../types/truffle-typings"

const jsonrpc = "2.0"
const id = 0
const send = function<T>(method: string, params: T[], web3Provider: Web3): Promise<{}> {
  return new Promise(function (resolve, reject) {
    (web3Provider.currentProvider as HttpProvider).send(
      {id, jsonrpc, method, params},
      (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      }
    )
  })
}

// Wait for n blocks to pass
/**
 * Wait for n (evm) seconds to pass
 * @param seconds: time to wait
 * @param web3Provider: potentially different in contract tests and system end-to-end testing.
 */
export const waitForNSeconds = async function (
  seconds: number,
  web3Provider = web3 as Web3
): Promise<void> {
  await send("evm_increaseTime", [seconds], web3Provider)
  await send("evm_mine", [], web3Provider)
}

export const closeAuction = async function(
  instance: EpochTokenLockerInstance,
  web3Provider = web3 as Web3
): Promise<void> {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch()
  ).toNumber()
  await waitForNSeconds(time_remaining + 1, web3Provider)
}

export const sendTxAndGetReturnValue = async function(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  method: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<void> {
  const result = await method.call(...args)
  await method(...args)
  return result
}

/**
 * Finalizes user's pending deposits by updating user's balances for all input tokens.
 * It assumes no withdrawals have been requested.
 * State of the contract after the execution of this function for tokenAddress:
 * balanceState[userAddress][tokenAddress] =
 * {
 *   balance: pendingDepositAmount,
 *   pendingDeposits: null,
 *   pendingWithdraws: null,
 * }
 * @param userAddress address of the user who deposited
 * @param epochTokenLocker instance of the epoch token locker to which the user deposited
 * @param tokenAddresses list of token addresses for which a deposit is pending
 */
export const applyBalances = async function(
  userAddress: string,
  epochTokenLocker: EpochTokenLockerInstance,
  tokenAddresses: string[]
): Promise<void> {
  await closeAuction(epochTokenLocker)
  for (const tokenAddress of tokenAddresses) {
    await epochTokenLocker.withdraw(userAddress, tokenAddress)
  }
}
