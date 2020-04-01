// Use the same ganache-cli version
// & launch options as truffle test
module.exports = {
  client: require("ganache-cli"),
  providerOptions: {
    default_balance_ether: 500000000,
  },
  skipFiles: ["BatchExchangeViewer.sol"],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
}
