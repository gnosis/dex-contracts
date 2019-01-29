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

module.exports = {
  falseArray,
  isActive,
  stateHash
}