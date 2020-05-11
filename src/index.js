/**
 * dex-contracts
 *
 * This NPM package provides smart contract artifacts used in the dFusion
 * protocol. Additional tools for interacting with the dFusion contracts and
 * performing migrations are also provided.
 */

module.exports = {
  BatchExchangeArtifact: require("../build/contracts/BatchExchange.json"),
  BatchExchangeViewerArtifact: require("../build/contracts/BatchExchangeViewer.json"),
  ...require("../build/common/src/fraction.js"),
  ...require("../build/common/src/orderbook.js"),
  ...require("./encoding.js"),
  ...require("./onchain_reading.js"),
  ...require("../build/common/src/balance_reader.js"),
}
