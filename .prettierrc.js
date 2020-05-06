module.exports = {
  bracketSpacing: true,
  printWidth: 129,
  semi: false,
  trailingComma: "es5",

  overrides: [
    {
      files: "*.sol",
      options: {
        bracketSpacing: false,
        explicitTypes: "always",
        tabWidth: 4,
      },
    },
  ],
}
