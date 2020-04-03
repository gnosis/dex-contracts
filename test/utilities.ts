import Web3 from "web3";
import {HttpProvider} from "web3-core";
import {EpochTokenLockerInstance} from "../types/truffle-typings";

const jsonrpc = "2.0";
const id = 0;
const send = function (method: string, params: any, web3Provider: Web3) {
  return new Promise(function (resolve, reject) {
    (web3Provider.currentProvider as HttpProvider).send(
      {id, jsonrpc, method, params},
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Wait for n blocks to pass
/**
 * Wait for n (evm) seconds to pass
 * @param seconds: time to wait
 * @param web3Provider: potentially different in contract tests and system end-to-end testing.
 */
export const waitForNSeconds = async function (
  seconds: number,
  web3Provider = (web3 as any) as Web3
) {
  await send("evm_increaseTime", [seconds], web3Provider);
  await send("evm_mine", [], web3Provider);
};

export const closeAuction = async (
  instance: EpochTokenLockerInstance,
  web3Provider = (web3 as any) as Web3
) => {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch()
  ).toNumber();
  await waitForNSeconds(time_remaining + 1, web3Provider);
};

export const sendTxAndGetReturnValue = async function (
  method: any,
  ...args: any[]
) {
  const result = await method.call(...args);
  await method(...args);
  return result;
};
