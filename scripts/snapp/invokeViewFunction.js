const SnappAuction = artifacts.require("SnappAuction")
const { invokeViewFunction } = require("../script_utilities.js")

// This script allows to view data from the SnappAuction contract
// example for viewing the current stateRoots: truffle exec scripts/snapp/viewSnappBaseForCurrentIndex.js 'stateRoots'

module.exports = async (callback) => {
  await invokeViewFunction(SnappAuction, callback)
}