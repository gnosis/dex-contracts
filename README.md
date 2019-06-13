[![Build Status](https://travis-ci.org/gnosis/dex-contracts.svg?branch=master)](https://travis-ci.org/gnosis/dex-contracts?branch=master)
<!-- TODO - Include solidity-coverage badge -->


# dFusion - Smart Contracts

The **dFusion Exchange** is a fully decentralized trading protocol which facilitates ring trades via discrete auction between several [ERC20](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md) token pairs.

It uses a batch auction for arbitrage-free exchanges while maximizing trader surplus to facilitate the development of a fairer Web3 ecosystem for everyone.


# Documentation
Checkout the [Formal Specification](https://github.com/gnosis/dex-research/blob/master/dFusion/dFusion.rst).

# CLI Examples

Checkout our [wiki](https://github.com/gnosis/dex-contracts/wiki/Script-Usage-Examples)

# Contributions
Our continuoius integration is running several linters which must pass in order to make a contribution to this repo. For your convenience there is a `pre-commit` hook file contained in the project's root directory. You can make your life easier by executing the following command after cloning this project (it will ensure your changes pass linting before allowing commits).

```bash
cp pre-commit .git/hooks/
chmod +x .git/hooks/pre-commit
```

For any other questions, comments or concerns please feel free to contact any of the project admins:

- Alex ([josojo](https://github.com/josojo))
- Ben ([bh2smith](https://github.com/bh2smith))
- Felix ([fleupold](https://github.com/fleupold))
