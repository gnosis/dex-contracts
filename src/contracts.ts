/**
 * This module re-exports the contract type definitions and Truffle artifacts
 * for the main Gnosis Protocol contracts:
 * - `BatchExchange`: The main contract for the Gnosis Protocol that handles all
 *   the balances and auctions.
 * - `BatchExchangeViewer`: A supplementary viewer contract with more efficient
 *   methods for reading EVM data.
 *
 * @packageDocumentation
 */

import { TransactionReceipt } from "web3-core";
import { Contract } from "web3-eth-contract";
import { AbiItem } from "web3-utils";

export { BatchExchange } from "../build/types/BatchExchange";
export { BatchExchangeViewer } from "../build/types/BatchExchangeViewer";

export * as BatchExchangeArtifact from "../build/contracts/BatchExchange.json";
export * as BatchExchangeViewerArtifact from "../build/contracts/BatchExchangeViewer.json";

export interface ContractArtifact {
  abi: AbiItem[];
  networks: {
    [key: string]: {
      address: string;
      transactionHash: string;
    };
  };
}

/**
 * Get a contract deployment, returning both the web3 contract object as well as
 * the transaction receipt for the contract deployment.
 *
 * @throws If the contract is not deployed on the network the web3 provider is
 * connected to.
 */
export async function deployment<C extends Contract>(
  web3: Web3,
  { abi, networks }: ContractArtifact,
): Promise<[C, TransactionReceipt]> {
  const chainId = await web3.eth.getChainId();
  const network = networks[chainId];
  if (!networks) {
    throw new Error(`not deployed on network with chain ID ${chainId}`);
  }

  const tx = await web3.eth.getTransactionReceipt(network.transactionHash);
  const contract = new web3.eth.Contract(abi, network.address);

  return [contract as C, tx];
}
