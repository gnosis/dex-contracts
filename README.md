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
```
npm install                         // This installs all dependencies
npx truffle build                   // This builds the contracts
npx truffle migrate --network NETWORKNAME --reset
npm run networks-extract            // extracts deployed addresses to networks.json
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

# Deploying a simple market maker order to Rinkeby:

The following script does deploy a simple order market maker order and a relevant
```
// Get token id of DAI
npx truffle exec scripts/stablex/invokeViewFunction.js 'tokenAddressToIdMap' '0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa' --network rinkeby"

// Get token id of TrueUSD
"npx truffle exec scripts/stablex/invokeViewFunction.js 'tokenAddressToIdMap' '0x0000000000085d4780B73119b644AE5ecd22b376' --network rinkeby"

// Make sure we have enough balances for the trades
npx truffle exec scripts/stablex/deposit.js --accountId=0 --tokenId=0 --amount=30 --network rinkeby&& \
npx truffle exec scripts/stablex/deposit.js --accountId=0 --tokenId=$TOKEN_ID_TUSD --amount=100 --network rinkeby

// Place market maker order in current auction
npx truffle exec scripts/stablex/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=$TOKEN_ID_TUSD --minBuy=1000 --maxSell=998 --validFor=20 --network rinkeby

// Place owl token order
npx truffle exec scripts/stablex/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=0 --minBuy=1000 --maxSell=1000 --validFor=20 --network rinkeby


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
