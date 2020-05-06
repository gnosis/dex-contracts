import BN from "bn.js"
import { BatchExchangeViewer } from "../build/types/BatchExchangeViewer"

export { BatchExchange } from "../build/types/BatchExchange"
export { BatchExchangeViewer } from "../build/types/BatchExchangeViewer"
export * from "./orderbook"
export * from "./fraction"

export interface ContractAbiEntry {
  type: string;
  name?: string;
  inputs: {
    indexed?: boolean;
    name: string;
    type: string;
  }[];
  outputs?: {
    name: string;
    type: string;
  }[];
  payable?: boolean;
  constant?: boolean;
  stateMutability?: string;
  anonymous?: boolean;
}

export interface ContractNetwork {
  links: {
    [key: string]: string;
  };
  address: string;
  transactionHash: string;
}

export interface ContractArtifact {
  contractName: string;
  abi: ContractAbiEntry[];
  metadata: string;
  bytecode: string;
  deployedBytecode: string;
  sourceMap: string;
  deployedSourceMap: string;
  source: string;
  sourcePath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legacyAST: any;
  compiler: {
    name: string;
    version: string;
  };
  networks: {
    [key: string]: ContractNetwork;
  };
  schemaVersion: string;
  updatedAt: string;
  devdoc: {
    details: string;
    methods: {
      [key: string]: {
        details: string;
      };
    };
  };
  userdoc: {
    methods: {
      [key: string]: {
        details: string;
      };
    };
  };
}

export declare const BatchExchangeArtifact: ContractArtifact
export declare const BatchExchangeViewerArtifact: ContractArtifact

export interface Order {
  user: string;
  sellTokenBalance: string;
  buyToken: string;
  sellToken: string;
  validFrom: string;
  validUntil: string;
  priceNumerator: string;
  priceDenominator: string;
  remainingAmount: string;
}

export interface OrderBN {
  user: string;
  sellTokenBalance: BN;
  buyToken: number;
  sellToken: number;
  validFrom: number;
  validUntil: number;
  priceNumerator: BN;
  priceDenominator: BN;
  remainingAmount: BN;
}

export declare function decodeOrders(bytes: string): Order[];
export declare function decodeOrdersBN(bytes: string): OrderBN[];

export declare function getOpenOrdersPaginated(
  contract: BatchExchangeViewer,
  pageSize: number
): AsyncIterable<OrderBN[]>;
