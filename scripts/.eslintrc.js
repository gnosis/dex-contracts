module.exports = {
  rules: {
    "@typescript-eslint/no-var-requires": "off",
  },
  overrides: [
    {
      files: ["*.js"],
      rules: {
        "no-console": "off",
      },
    },
  ],
}
