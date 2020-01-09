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
  ast: any[];
  legacyAST: any[];
  compiler: {
    name: string;
    version: string;
  };
  networks: {
    [key: string]: ContractNetwork;
  };
  schemaVersion: string;
  updatedAt: string;
  devdoc: any;
  userdoc: any;
}

export declare const BatchExchange: ContractArtifact;
export declare const SnappAuction: ContractArtifact;

export interface Order {
  user: string,
  sellTokenBalance: string,
  buyToken: string,
  sellToken: string,
  validFrom: string,
  validUntil: string,
  priceNumerator: string,
  priceDenominator: string,
  remainingAmount: string,
}

export declare function decodeOrders(bytes: string): Order[];
