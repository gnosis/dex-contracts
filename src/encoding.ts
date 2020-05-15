/**
 * encoding.js
 *
 * This NPM module provide encoding and decoding utilities for interacting with
 * dFusion smart contracts where manual byte encoding was needed because of
 * solidity ABI limitations.
 */
import BN from "bn.js";
import assert from "assert";

export interface Order<T = BN> {
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

export interface IndexedOrder<T = BN> extends Order<T> {
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
  bytes: string | null,
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
export function decodeOrders(bytes: string | null): Order<BN>[] {
  return decodeOrdersInternal<Order<BN>>(bytes, decodeOrder, 112);
}

/**
 * Decodes a byte-encoded variable length array of orders and their indices.
 * This can be used to decode the result of `BatchExchangeViewer.getOpenOrderBook` and
 * `BatchExchangeViewer.getFinalizedOrderBook`.
 */
export function decodeIndexedOrders(bytes: string | null): IndexedOrder<BN>[] {
  return decodeOrdersInternal<IndexedOrder<BN>>(bytes, decodeIndexedOrder, 114);
}

type EncodableInt = string | { toString(base: number): string };

class OrderEncoder {
  private index = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer);
  }

  private encodeHex(hex: string): void {
    const len = hex.length / 2;
    for (let i = 0; i < len; i++) {
      this.bytes[i + this.index] = parseInt(hex.substr(i * 2, 2), 16);
    }
    this.index += len;
  }

  encodeAddr(addr: string): void {
    assert(
      addr.length === 42 && addr.substr(0, 2) === "0x",
      `invalid Ethereum address '${addr}`,
    );
    this.encodeHex(addr.substr(2));
  }

  encodeInt(size: number, value: EncodableInt): void {
    const hex =
      typeof value === "string"
        ? BigInt(value).toString(16)
        : value.toString(16);

    assert(hex.length < size * 2, `value ${value} overflows ${size} bits`);
    this.encodeHex(hex.padStart(size / 4, "0"));
  }

  encodeNumber(size: 16 | 32, value: number): void {
    let setter: keyof DataView;
    switch (size) {
      case 16:
        setter = "setUint16";
        break;
      case 32:
        setter = "setUint32";
        break;
    }
    this.view[setter](this.index, value, false);
    this.index += size / 8;
  }

  encodeOrder<T extends EncodableInt>(order: Order<T>): void {
    this.encodeAddr(order.user);
    this.encodeInt(256, order.sellTokenBalance);
    this.encodeNumber(16, order.buyToken);
    this.encodeNumber(16, order.sellToken);
    this.encodeNumber(32, order.validFrom);
    this.encodeNumber(32, order.validUntil);
    this.encodeInt(128, order.priceNumerator);
    this.encodeInt(128, order.priceDenominator);
    this.encodeInt(128, order.remainingAmount);
  }

  encodeIndexedOrder<T extends EncodableInt>(order: IndexedOrder<T>): void {
    this.encodeOrder(order);
    this.encodeNumber(16, order.orderId);
  }
}

function encodeOrdersInternal<T>(
  orders: T[],
  stride: number,
  encode: (encoder: OrderEncoder, order: T) => void,
): Uint8Array {
  const bytes = new Uint8Array(orders.length * stride);
  const encoder = new OrderEncoder(bytes);
  for (const order of orders) {
    encode(encoder, order);
  }
  return bytes;
}

/**
 * Encodes an array of orders into a `Uint8Array` of bytes. This uses the same
 * format as `BatchExchange.getEncodedOrders`.
 */
export function encodeOrders<T extends EncodableInt>(
  orders: Order<T>[],
): Uint8Array {
  return encodeOrdersInternal(orders, 112, (encoder, order) =>
    encoder.encodeOrder(order),
  );
}

/**
 * Encodes an array of indexed orders into a `Uint8Array` of bytes. This uses
 * the same format as `BatchExchangeViewer.getFilteredOrderBook`.
 */
export function encodeIndexedOrders<T extends EncodableInt>(
  orders: IndexedOrder<T>[],
): Uint8Array {
  return encodeOrdersInternal(orders, 114, (encoder, order) =>
    encoder.encodeIndexedOrder(order),
  );
}
