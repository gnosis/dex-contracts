module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  env: {
    node: true,
    commonjs: true,
    es2020: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/eslint-recommended", "plugin:@typescript-eslint/recommended"],
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    indent: ["error", 2],
    "linebreak-style": ["error", "unix"],
    "no-console": "error",
    quotes: ["error", "double"],
    semi: ["error", "never"],

    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/no-use-before-define": "off",
  },
  globals: {
    artifacts: false,
    contract: false,
    assert: false,
    web3: false,
  },
  overrides: [
    {
      files: ["*.js"],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
  ignorePatterns: ["build/", "coverage/", "node_modules/"],
}
