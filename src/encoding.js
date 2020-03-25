/**
 * encoding.js
 *
 * This NPM module provide encoding and decoding utilities for interacting with
 * dFusion smart contracts where manual byte encoding was needed because of
 * solidity ABI limitations.
 */

const assert = require("assert")
const BN = require("bn.js")

/**
 * Decodes a byte-encoded variable length array of orders. This can be used to
 * decode the result of `BatchExchange.getEncodedUserOrders` and
 * `BatchExchange.getEncodedOrders`.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded array of orders
 */
function decodeOrders(bytes) {
  assert(typeof bytes === "string" || bytes instanceof String, "bytes parameter must be a string")
  assert((bytes.length - 2) % 112 === 0, "malformed bytes")

  let index = 2 // skip '0x'
  const readBytes = (size) => bytes.slice(index, (index += size * 2))

  const decodeAddr = () => `0x${readBytes(20)}`
  const decodeInt = (size) => new BN(readBytes(size / 8), 16).toString()

  const result = []
  while (index < bytes.length) {
    result.push({
      user: decodeAddr(),
      sellTokenBalance: decodeInt(256),
      buyToken: decodeInt(16),
      sellToken: decodeInt(16),
      validFrom: decodeInt(32),
      validUntil: decodeInt(32),
      priceNumerator: decodeInt(128),
      priceDenominator: decodeInt(128),
      remainingAmount: decodeInt(128),
    })
  }
  return result
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

module.exports = {
  decodeOrders,
  decodeOrdersBN,
}
