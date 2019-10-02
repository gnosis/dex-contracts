const path = require("path")

// eslint-disable-next-line no-undef
const BUILD_DIR = path.join(__dirname, "..", "..", "build", "contracts")
// eslint-disable-next-line no-undef
const NETWORKS_FILE_PATH = path.join(__dirname, "..", "..", "networks.json")

module.exports = {
  buildPath: BUILD_DIR,
  buildDirDependencies: [],
  networkFilePath: NETWORKS_FILE_PATH
}
