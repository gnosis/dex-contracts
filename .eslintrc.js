module.exports = {
  parser: "@typescript-eslint/parser",
  env: {
    node: true,
    commonjs: true,
    es2020: true,
  },
  extends: [
    "eslint:recommended",
    // "plugin:@typescript-eslint/eslint-recommended",
    // "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2015,
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint"],
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
