/**
 * encoding.js
 *
 * This NPM module provide encoding and decoding utilities for interacting with
 * dFusion smart contracts where manual byte encoding was needed because of
 * solidity ABI limitations.
 */
import BN from "bn.js";
import assert from "assert";

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

class OrderBuffer {
  private index = 2; // skip '0x'
  constructor(private readonly bytes: string) {}

  readBytes = (size: number): string =>
    this.bytes.slice(this.index, (this.index += size * 2));

  decodeAddr = (): string => `0x${this.readBytes(20)}`;
  decodeInt = (size: number): BN => new BN(this.readBytes(size / 8), 16);
  decodeNumber = (size: number): number =>
    parseInt(this.readBytes(size / 8), 16);
  hasMoreBytes = (): boolean => this.index < this.bytes.length;
}

function decodeOrder(bytes: OrderBuffer): Order<BN> {
  return {
    user: bytes.decodeAddr(),
    sellTokenBalance: bytes.decodeInt(256),
    buyToken: bytes.decodeNumber(16),
    sellToken: bytes.decodeNumber(16),
    validFrom: bytes.decodeNumber(32),
    validUntil: bytes.decodeNumber(32),
    priceNumerator: bytes.decodeInt(128),
    priceDenominator: bytes.decodeInt(128),
    remainingAmount: bytes.decodeInt(128),
  };
}

function decodeIndexedOrder(bytes: OrderBuffer): IndexedOrder<BN> {
  return {
    ...decodeOrder(bytes),
    orderId: bytes.decodeNumber(16),
  };
}

function decodeOrdersInternal<T>(
  bytes: string,
  decodeFunction: (x: OrderBuffer) => T,
  width: number,
): T[] {
  if (bytes === null || bytes === undefined || bytes.length === 0) {
    return [];
  }
  assert((bytes.length - 2) % width === 0, "malformed bytes");

  const buffer = new OrderBuffer(bytes);
  const result = [];
  while (buffer.hasMoreBytes()) {
    result.push(decodeFunction(buffer));
  }
  return result;
}

/**
 * Decodes a byte-encoded variable length array of orders. This can be used to
 * decode the result of `BatchExchange.getEncodedUserOrders` and
 * `BatchExchange.getEncodedOrders`.
 */
export function decodeOrders(bytes: string): Order<BN>[] {
  return decodeOrdersInternal<Order<BN>>(bytes, decodeOrder, 112);
}

/**
 * Decodes a byte-encoded variable length array of orders and their indices.
 * This can be used to decode the result of `BatchExchangeViewer.getOpenOrderBook` and
 * `BatchExchangeViewer.getFinalizedOrderBook`.
 */
export function decodeIndexedOrders(bytes: string): IndexedOrder<BN>[] {
  return decodeOrdersInternal<IndexedOrder<BN>>(bytes, decodeIndexedOrder, 114);
}
