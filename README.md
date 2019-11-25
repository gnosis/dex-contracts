[![Build Status](https://travis-ci.org/gnosis/dex-contracts.svg?branch=master)](https://travis-ci.org/gnosis/dex-contracts?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/gnosis/dex-contracts/badge.svg?branch=master)](https://coveralls.io/github/gnosis/dex-contracts?branch=master)



# dFusion - Smart Contracts

The **dFusion Exchange** is a fully decentralized trading protocol which facilitates ring trades via discrete auction between several [ERC20](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md) token pairs.

It uses a batch auction for arbitrage-free exchanges while maximizing trader surplus to facilitate the development of a fairer Web3 ecosystem for everyone.


# Documentation
Checkout the [Formal Specification](https://github.com/gnosis/dex-research/blob/master/dFusion/dFusion.rst).

# CLI Examples

Checkout our [wiki](https://github.com/gnosis/dex-contracts/wiki/Script-Usage-Examples)


# Deployment Process

For the deployment of the contracts into an official network, follow this steps:

1. Make sure that all depended contracts and libraries - e.g. BytesLib - has been deployed to the intended network and that their network information is available in the npm modules

2. Run the following commands
```sh
npm install                         // This installs all dependencies
npx truffle build                   // This builds the contracts
npx truffle migrate --network $NETWORKNAME --reset
npm run networks-extract            // extracts deployed addresses to networks.json
```

3. Verify the contracts for some cool Etherscan.io goodies
```sh
npx truffle run verify SnappAuction --network $NETWORKNAME
npx truffle run verify StablecoinConverter --network $NETWORKNAME
```

4. List some default tokens on the StableX exchange
```sh
npx truffle exec scripts/stablex/add_token_list.js --network $NETWORKNAME
```

# Retrieving previous deployments

In order to use the previously deployed contracts, which are documented in the network.json file, the following steps are necessary:

1. Build the contracts:
```
npx truffle compile
```

2. Inject address from network.json into the builds:
```
npm run networks-inject 
```

# Contributions
Our continuous integration is running several linters which must pass in order to make a contribution to this repo. For your convenience there is a `pre-commit` hook file contained in the project's root directory. You can make your life easier by executing the following command after cloning this project (it will ensure your changes pass linting before allowing commits).

```bash
cp pre-commit .git/hooks/
chmod +x .git/hooks/pre-commit
```

For any other questions, comments or concerns please feel free to contact any of the project admins:

- Alex ([josojo](https://github.com/josojo))
- Ben ([bh2smith](https://github.com/bh2smith))
- Felix ([fleupold](https://github.com/fleupold))
