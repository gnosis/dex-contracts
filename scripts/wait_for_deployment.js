/* eslint-disable no-undef, no-constant-condition */

const SnappBase = artifacts.require("SnappBase")

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = async function(callback) {
  let i = 0
  while (true) {
    try {
      await SnappBase.deployed()
      callback()
    } catch(e) {
      if (i > 20) {
        callback(e)
      }
      i++
    }
    await sleep(1000)
  }
}
