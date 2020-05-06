/**
 * encoding.js
 *
 * This NPM module provide encoding and decoding utilities for interacting with
 * dFusion smart contracts where manual byte encoding was needed because of
 * solidity ABI limitations.
 */

const assert = require("assert")
const BN = require("bn.js")

class OrderBuffer {
  constructor(bytes) {
    this.bytes = bytes
    this.index = 2 // skip '0x'

    this.readBytes = (size) => this.bytes.slice(this.index, (this.index += size * 2))

    this.decodeAddr = () => `0x${this.readBytes(20)}`
    this.decodeInt = (size) => new BN(this.readBytes(size / 8), 16).toString()

    return this
  }
}

function decodeOrder(bytes) {
  return {
    user: bytes.decodeAddr(),
    sellTokenBalance: bytes.decodeInt(256),
    buyToken: bytes.decodeInt(16),
    sellToken: bytes.decodeInt(16),
    validFrom: bytes.decodeInt(32),
    validUntil: bytes.decodeInt(32),
    priceNumerator: bytes.decodeInt(128),
    priceDenominator: bytes.decodeInt(128),
    remainingAmount: bytes.decodeInt(128),
  }
}

function decodeIndexedOrder(bytes) {
  return {
    ...decodeOrder(bytes),
    orderId: bytes.decodeInt(16),
  }
}

function decodeOrdersInternal(bytes, decodeFunction, width) {
  if (bytes === null || bytes === undefined || bytes.length === 0) {
    return []
  }
  assert(typeof bytes === "string" || bytes instanceof String, "bytes parameter must be a string")
  assert((bytes.length - 2) % width === 0, "malformed bytes")

  const buffer = new OrderBuffer(bytes)
  const result = []
  while (buffer.index < buffer.bytes.length) {
    result.push(decodeFunction(buffer))
  }
  return result
}

/**
 * Decodes a byte-encoded variable length array of orders. This can be used to
 * decode the result of `BatchExchange.getEncodedUserOrders` and
 * `BatchExchange.getEncodedOrders`.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded array of orders
 */
function decodeOrders(bytes) {
  return decodeOrdersInternal(bytes, decodeOrder, 112)
}

function decodeOrdersBN(bytes) {
  return decodeOrders(bytes).map((e) => ({
    user: e.user,
    sellTokenBalance: new BN(e.sellTokenBalance),
    buyToken: parseInt(e.buyToken),
    sellToken: parseInt(e.sellToken),
    validFrom: parseInt(e.validFrom),
    validUntil: parseInt(e.validUntil),
    priceNumerator: new BN(e.priceNumerator),
    priceDenominator: new BN(e.priceDenominator),
    remainingAmount: new BN(e.remainingAmount),
  }))
}

/**
 * Decodes a byte-encoded variable length array of orders and their indices.
 * This can be used to decode the result of `BatchExchangeViewer.getOpenOrderBook` and
 * `BatchExchangeViewer.getFinalizedOrderBook`.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded array of orders and their orderIds
 */
function decodeIndexedOrders(bytes) {
  return decodeOrdersInternal(bytes, decodeIndexedOrder, 114)
}

function decodeIndexedOrdersBN(bytes) {
  return decodeIndexedOrders(bytes).map((e) => ({
    user: e.user,
    orderId: parseInt(e.orderId),
    sellTokenBalance: new BN(e.sellTokenBalance),
    buyToken: parseInt(e.buyToken),
    sellToken: parseInt(e.sellToken),
    validFrom: parseInt(e.validFrom),
    validUntil: parseInt(e.validUntil),
    priceNumerator: new BN(e.priceNumerator),
    priceDenominator: new BN(e.priceDenominator),
    remainingAmount: new BN(e.remainingAmount),
  }))
}

module.exports = {
  decodeOrders,
  decodeOrdersBN,
  decodeIndexedOrders,
  decodeIndexedOrdersBN,
}
