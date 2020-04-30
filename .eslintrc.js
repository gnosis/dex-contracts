module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: "module",
  },
  plugins: [
    "react",
    "@typescript-eslint",
  ],
  rules: {
    indent: ["error", 2],
    "linebreak-style": ["error", "unix"],
    quotes: ["error", "double"],
    semi: ["error", "never"],
    "prefer-const": ["error"],
    "no-var": ["error"],

    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error"],
  },
  globals: {
    artifacts: false,
    contract: false,
    assert: false,
    web3: false,
  },
}
