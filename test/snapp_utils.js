// returns boolean array of length num filled with false 
// except for those indicies in true_list
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
  return block <= object.creationBlock.toNumber() + 20
}

const stateHash = async function(contract) {
  const state_index = (await contract.stateIndex.call()).toNumber()
  const state_root = await contract.stateRoots.call(state_index)
  return state_root
}

// returns byte string of hexed-sliced-padded int
const uint8 = function(num) {
  assert(num < 2**8)
  return web3.utils.toHex(num).slice(2).padStart(2, "0")

}

// returns byte string of hexed-sliced-padded int
const uint16 = function(num) {
  assert(num < 2**16)
  return web3.utils.toHex(num).slice(2).padStart(4, "0")
}

// returns byte string of hexed-sliced-padded int
const uint128 = function(num) {
  assert(num < 2**128)
  return web3.utils.toHex(num).slice(2).padStart(32, "0")
}

// returns equivalent to Soliditiy's abi.encodePacked(uint16 a, uint8 b, uint128 c)
const encodePacked_16_8_128 = function(a, b, c) {
  return "0x" + uint16(a) + uint8(b) + uint128(c)
}

module.exports = {
  falseArray,
  isActive,
  stateHash,
  encodePacked_16_8_128
}