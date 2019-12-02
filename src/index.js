/**
 * dex-contracts
 *
 * This NPM package provides smart contract artifacts used in the dFusion
 * protocol. Additional tools for interacting with the dFusion contracts and
 * performing migrations are also provided.
 */

const assert = require("assert")
const BN = require("bn.js")

const BatchExchange = require("../build/contracts/BatchExchange.json")
const SnappAuction = require("../build/contracts/SnappAuction.json")

/**
 * Decodes auction elements returned from `BatchExchange.getEncodedAuctionElements`
 * which are manually encoded into bytes to get around Solidity ABI limitations.
 * @param {string} bytes The encoded bytes in hex in the form '0x...'
 * @return {Object[]} The decoded auction elements
 */
function decodeRawAuctionElements(bytes) {
  assert(typeof bytes === "string" || bytes instanceof String, "bytes parameter must be a string")
  assert((bytes.length - 2) % 112 === 0, "malformed bytes")

  let index = 2 // skip '0x'
  const readBytes = size => bytes.slice(index, (index += size * 2))

  const decodeAddr = () => `0x${readBytes(20)}`
  const decodeInt = size => new BN(readBytes(size / 8), 16).toString()

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

module.exports = {
  BatchExchange,
  SnappAuction,
  decodeRawAuctionElements,
}
