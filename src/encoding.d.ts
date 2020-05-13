import BN from "bn.js";

export interface Order<T = string> {
  user: string;
  sellTokenBalance: T;
  buyToken: number;
  sellToken: number;
  validFrom: number;
  validUntil: number;
  priceNumerator: T;
  priceDenominator: T;
  remainingAmount: T;
}

export interface IndexedOrder<T> extends Order<T> {
  orderId: number;
}

export declare function decodeOrders(bytes: string): Order<string>[];
export declare function decodeOrdersBN(bytes: string): Order<BN>[];
