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

import { AbiItem } from "web3-utils";
import BatchExchangeArtifact from "../build/contracts/BatchExchange.json";
import BatchExchangeViewerArtifact from "../build/contracts/BatchExchangeViewer.json";

export { BatchExchange } from "../build/types/BatchExchange";
export { BatchExchangeViewer } from "../build/types/BatchExchangeViewer";
export { BatchExchangeArtifact, BatchExchangeViewerArtifact };

export interface ContractArtifact {
  abi: AbiItem[];
  networks: {
    [key: string]: {
      address: string;
      transactionHash: string;
    };
  };
}
