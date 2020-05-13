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

import type { AbiItem } from "web3-utils";
import type { BatchExchange } from "../build/types/BatchExchange";
import type { BatchExchangeViewer } from "../build/types/BatchExchangeViewer";
import BatchExchangeArtifact from "../build/contracts/BatchExchange.json";
import BatchExchangeViewerArtifact from "../build/contracts/BatchExchangeViewer.json";

export {
  BatchExchange,
  BatchExchangeArtifact,
  BatchExchangeViewer,
  BatchExchangeViewerArtifact,
};

export interface ContractArtifact {
  abi: AbiItem[];
  networks: {
    [key: string]: {
      address: string;
      transactionHash: string;
    };
  };
}
