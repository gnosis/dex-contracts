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

# Deploying a simple market maker scenario to Rinkeby:

The following script deploys a simple market maker order and a necessary owl order, to enable trading:
```
// Get token ID of DAI
npx truffle exec scripts/stablex/invokeViewFunction.js 'tokenAddressToIdMap' '0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa' --network rinkeby

// Export the resulting token ID
export TOKEN_ID_DAI=[Result from last call]

// Get token ID of TrueUSD
npx truffle exec scripts/stablex/invokeViewFunction.js 'tokenAddressToIdMap' '0x0000000000085d4780B73119b644AE5ecd22b376' --network rinkeby

// Export the resulting token ID
export TOKEN_ID_TUSD=[Result from last call]

// Make sure that the users have deposited sufficient funds into the exchange
npx truffle exec scripts/stablex/deposit.js --accountId=0 --tokenId=0 --amount=30 --network rinkeby&& \
npx truffle exec scripts/stablex/deposit.js --accountId=0 --tokenId=$TOKEN_ID_TUSD --amount=100 --network rinkeby

// Place  market-maker order in current auction
npx truffle exec scripts/stablex/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=$TOKEN_ID_TUSD --minBuy=1000 --maxSell=998 --validFor=20 --network rinkeby

// Place owl token order
npx truffle exec scripts/stablex/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=0 --minBuy=1000 --maxSell=1000 --validFor=20 --network rinkeby

```

Then, after switching to another account, a market order can be placed:
```
// Deposit funds into exchange:
npx truffle exec scripts/stablex/deposit.js --accountId=0 --tokenId=$TOKEN_ID_DAI --amount=100 --network rinkeby

// Place market order with 1/2 limit-price
npx truffle exec scripts/stablex/place_order.js --accountId=1 --buyToken=$TOKEN_ID_TUSD --sellToken=$TOKEN_ID_DAI --minBuy=500 --maxSell=1000 --validFor=5 --network rinkeby
```

Now, the market can be inspected by:
```
npx truffle exec scripts/stablex/get_auction_elements.js --network rinkeby
```

And the output should look like this:
```
[ { user: '0x740a98f8f4fae0986fb3264fe4aacf94ac1ee96f',
    sellTokenBalance: 100000000000000000000,
    buyToken: 7,
    sellToken: 3,
    validFrom: 5247563,
    validUntil: 5247583,
    priceNumerator: 1e+21,
    priceDenominator: 998000000000000000000,
    remainingAmount: 998000000000000000000 },
  { user: '0x740a98f8f4fae0986fb3264fe4aacf94ac1ee96f',
    sellTokenBalance: 30000000000000000000,
    buyToken: 7,
    sellToken: 0,
    validFrom: 5247563,
    validUntil: 5247583,
    priceNumerator: 1e+21,
    priceDenominator: 1e+21,
    remainingAmount: 1e+21 },
  { user: 'account',
    sellTokenBalance: 100000000000000000000,
    buyToken: 3,
    sellToken: 7,
    validFrom: 5247750,
    validUntil: 5247755,
    priceNumerator: 500000000000000000000,
    priceDenominator: 1e+21,
    remainingAmount: 1e+21 } ]
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
