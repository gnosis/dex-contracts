/**
 * encoding.js
 *
 * This NPM module provide encoding and decoding utilities for interacting with
 * dFusion smart contracts where manual byte encoding was needed because of
 * solidity ABI limitations.
 */

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

const assert = require("assert");
const BN = require("bn.js");

class OrderBuffer {
  index = 2; // skip '0x'
  constructor(public bytes: string) {}

  readBytes = (size: number) =>
    this.bytes.slice(this.index, (this.index += size * 2));

  decodeAddr = () => `0x${this.readBytes(20)}`;
  decodeInt = (size: number) => new BN(this.readBytes(size / 8), 16).toString();
  decodeNumber = (size: number) => parseInt(this.readBytes(size / 8), 16);
}

function decodeOrder(bytes: OrderBuffer) {
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

function decodeIndexedOrder(bytes: OrderBuffer) {
  return {
    ...decodeOrder(bytes),
    orderId: bytes.decodeNumber(16),
  };
}

function decodeOrdersInternal<T>(
  bytes: string,
  decodeFunction: (x: OrderBuffer) => Order<T> | IndexedOrder<T>,
  width: number,
) {
  if (bytes === null || bytes === undefined || bytes.length === 0) {
    return [];
  }
  assert((bytes.length - 2) % width === 0, "malformed bytes");

  const buffer = new OrderBuffer(bytes);
  const result = [];
  while (buffer.index < buffer.bytes.length) {
    result.push(decodeFunction(buffer));
  }
  return result;
}

/**
 * Decodes a byte-encoded variable length array of orders. This can be used to
 * decode the result of `BatchExchange.getEncodedUserOrders` and
 * `BatchExchange.getEncodedOrders`.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded array of orders
 */
export function decodeOrders(bytes: string) {
  return decodeOrdersInternal(bytes, decodeOrder, 112);
}

export function decodeOrdersBN(bytes: string) {
  return decodeOrders(bytes).map((e) => ({
    ...e,
    sellTokenBalance: new BN(e.sellTokenBalance),
    priceNumerator: new BN(e.priceNumerator),
    priceDenominator: new BN(e.priceDenominator),
    remainingAmount: new BN(e.remainingAmount),
  }));
}

/**
 * Decodes a byte-encoded variable length array of orders and their indices.
 * This can be used to decode the result of `BatchExchangeViewer.getOpenOrderBook` and
 * `BatchExchangeViewer.getFinalizedOrderBook`.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded array of orders and their orderIds
 */
export function decodeIndexedOrders(bytes: string) {
  return decodeOrdersInternal(bytes, decodeIndexedOrder, 114);
}

export function decodeIndexedOrdersBN(bytes: string) {
  return decodeIndexedOrders(bytes).map((e) => ({
    ...e,
    sellTokenBalance: new BN(e.sellTokenBalance),
    priceNumerator: new BN(e.priceNumerator),
    priceDenominator: new BN(e.priceDenominator),
    remainingAmount: new BN(e.remainingAmount),
  }));
}
