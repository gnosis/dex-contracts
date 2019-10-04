const assert = require("assert")
const BN = require("bn.js")

// returns boolean array of length num filled with false 
// except for those indices in true_list
const falseArray = function(num, true_list) {
  const res = []
  for (let i=0; i < num; i++) {
    res.push(false)
  }
  if (true_list) {
    for (let i=0; i < true_list.length; i++) {
      res[true_list[i]] = true
    }
  }
  return res
}

// Returns boolean representing whether deposit or withdraw state (of type PendingFlux) is active
const isActive = async function(object) {
  const block = await web3.eth.getBlockNumber()
  const timestamp = (await web3.eth.getBlock(block)).timestamp
  return timestamp <= object.creationTimestamp.toNumber() + 180
}
// returns byte string of hexed-sliced-padded int
const uint8 = function(num) {
  assert(num < 2**8)
  return num.toString(16).padStart(2, "0")

}

// returns byte string of hexed-sliced-padded int
const uint16 = function(num) {
  assert(num < 2**16)
  return num.toString(16).padStart(4, "0")
}

// returns byte string of hexed-sliced-padded int
const uint128 = function(num) {
  const twoPowOneTwentyEight = new BN(2).pow(new BN(128))
  assert(num < twoPowOneTwentyEight)
  return num.toString(16).padStart(32, "0")
}

// returns byte string of hexed-sliced-padded int
const uint96 = function(num) {
  const twoPowNinteySix = new BN(2).pow(new BN(96))
  assert(num < twoPowNinteySix)
  return num.toString(16).padStart(24, "0")
}

// returns equivalent to Soliditiy's abi.encodePacked(uint16 a, uint8 b, uint128 c)
const encodePacked_16_8_128 = function(a, b, c) {
  return Buffer.from("00000000000000000000000000" + uint16(a) + uint8(b) + uint128(c), "hex")
}

const encodeOrder = function(buyToken, sellToken, buyAmount, sellAmount) {
  return Buffer.from(uint96(buyAmount) + uint96(sellAmount) + uint8(sellToken) + uint8(buyToken) , "hex")
}

module.exports = {
  falseArray,
  isActive,
  encodePacked_16_8_128,
  encodeOrder
}
