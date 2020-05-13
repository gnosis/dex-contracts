import BN from "bn.js";
import { BatchExchangeViewer } from "./contracts";
import { IndexedOrder } from "./encoding";

export declare function getOpenOrdersPaginated(
  contract: BatchExchangeViewer,
  pageSize: number,
  blockNumber?: number | string,
): AsyncIterable<IndexedOrder<BN>[]>;

export declare function getOpenOrders(
  contract: BatchExchangeViewer,
  pageSize: number,
  blockNumber?: number | string,
): Promise<IndexedOrder<BN>[]>;
