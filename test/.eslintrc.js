module.exports = {
  env: {
    mocha: true,
    node: true,
  },
  plugins: ["no-only-tests"],
  rules: {
    "no-only-tests/no-only-tests": "error",
  },
}
