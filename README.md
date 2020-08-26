[![Build Status](https://travis-ci.org/gnosis/dex-contracts.svg?branch=master)](https://travis-ci.org/gnosis/dex-contracts?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/gnosis/dex-contracts/badge.svg?branch=master)](https://coveralls.io/github/gnosis/dex-contracts?branch=master)

# Gnosis Protocol - Smart Contracts

The **Gnosis Protocol Exchange** is a fully decentralized trading protocol which facilitates ring trades via discrete auction between several [ERC20](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md) token pairs.

It uses a batch auction for arbitrage-free exchanges while maximizing trader surplus to facilitate the development of a fairer Web3 ecosystem for everyone.

# Documentation

Checkout the [Smart Contract Documentation](https://docs.google.com/document/d/1OfT83TcmwGeAPoQcg1aAt7_CiSskGpftBZgYmk0xIag).

# Audit report

The audit report can be found [here](https://github.com/gnosis/dex-contracts/blob/master/Exchange_audit_report.pdf).

# CLI Examples

Checkout [wiki](https://github.com/gnosis/dex-contracts/wiki/Script-Usage-Examples)

# Deployment Process

For the deployment of the contracts into an official network, follow this steps:

1. Make sure that all depended contracts and libraries - e.g. BytesLib - has been deployed to the intended network and that their network information is available in the npm modules

2. Run the following commands

```sh
yarn install                        # This installs all dependencies
npx truffle build                   # This builds the contracts
npx truffle migrate --network $NETWORKNAME --reset
yarn run networks-extract           # extracts deployed addresses to networks.json
```

If you are building for a local development network, ganache has to be running locally. For this you can e.g. in a separate shell run

```sh
yarn run ganache # start a development network (blocking)
```

If you want to deploy the contracts with an already existing fee token (tokenId 0), you can set the env variable

```
export FEE_TOKEN_ADDRESS=...
```

before running the migration script.

3. Verify the contracts for some cool Etherscan.io goodies (see below for more help)

```sh
npx truffle run verify BatchExchange --network $NETWORKNAME
```

4. List some default tokens on the StableX exchange

```sh
npx truffle exec scripts/add_token_list.js --network $NETWORKNAME
```

## Verifying Contracts

In order to verify a contract on Etherscan.io, you need to first create an account and an API key

1. Navigate to https://etherscan.io/myapikey
2. Login or create an account
3. Generate a new API key
4. Add `export MY_ETHERSCAN_API_KEY="..."` to your `~/.zshrc`, `~/.bash_profile`, or similar

Note, if you have a specific contract address in mind (i.e. one which is not specified in `networks.json`) it may be referred to by address as

```sh
npx truffle run verify $CONTRACT_NAME@$CONTRACT_ADDRESS --network $NETWORKNAME
```

# Retrieving previous deployments

In order to use the previously deployed contracts, which are documented in the network.json file, the following steps are necessary:

1. Build the contracts:

```
npx truffle compile
```

2. Inject address from network.json into the builds:

```
yarn run networks-inject
```

# Deploying a simple market maker scenario to Rinkeby:

The following script deploys a simple market maker order and a necessary owl order, to enable trading:

```sh
# Get token ID of DAI
npx truffle exec scripts/invokeViewFunction.js 'tokenAddressToIdMap' '0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa' --network rinkeby

# Export the resulting token ID
export TOKEN_ID_DAI=[Result from last call]

# Get token ID of TrueUSD
npx truffle exec scripts/invokeViewFunction.js 'tokenAddressToIdMap' '0x0000000000085d4780B73119b644AE5ecd22b376' --network rinkeby

# Export the resulting token ID
export TOKEN_ID_TUSD=[Result from last call]

# Make sure that the users have deposited sufficient funds into the exchange
# Please be aware that the specified amounts are multiples of 10**18
npx truffle exec scripts/deposit.js --accountId=0 --tokenId=0 --amount=30 --network rinkeby&& \
npx truffle exec scripts/deposit.js --accountId=0 --tokenId=$TOKEN_ID_TUSD --amount=100 --network rinkeby

# Place  market-maker order in current auction
# This simulates a strategy expected from market makers: trading stable coins against each other
# with a spread of 0.02 percent
npx truffle exec scripts/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=$TOKEN_ID_TUSD --minBuy=1000 --maxSell=998 --validFor=20 --network rinkeby

# Place owl token order for the fee mechanism
npx truffle exec scripts/place_order.js --accountId=0 --buyToken=$TOKEN_ID_DAI --sellToken=0 --minBuy=1000 --maxSell=1000 --validFor=20 --network rinkeby

```

Then, the market order can be place, after switching to another account. Usually, this is expected to happen via the UI. If it will be done via the console, following commands can be used:

```sh
# Deposit funds into exchange:
npx truffle exec scripts/deposit.js --accountId=0 --tokenId=$TOKEN_ID_DAI --amount=100 --network rinkeby

# Place market order with 1/2 limit-price
npx truffle exec scripts/place_order.js --accountId=1 --buyToken=$TOKEN_ID_TUSD --sellToken=$TOKEN_ID_DAI --minBuy=500 --maxSell=1000 --validFor=5 --network rinkeby
```

Now, the market can be inspected by:

```sh
# view the market status:
npx truffle exec scripts/get_auction_elements.js --network rinkeby

```

And the output should look like this:

```sh
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

# Building on top of BatchExchange

The integration of the Gnosis Protocol contracts into your own truffle project are demonstrated here:
https://github.com/gnosis/dex-contracts-integration-example. This repository contains a minimal
truffle project allowing to build on top of contracts.
Please consult its readme for further information.

# Contributions

The continuous integration is running several linters which must pass in order to make a contribution to this repo. For your convenience there is a `pre-commit` hook file contained in the project's root directory. You can make your life easier by executing the following command after cloning this project (it will ensure your changes pass linting before allowing commits).

```bash
cp pre-commit .git/hooks/
chmod +x .git/hooks/pre-commit
```

For any other questions, comments or concerns please feel free to contact any of the project admins:

- Alex ([josojo](https://github.com/josojo))
- Ben ([bh2smith](https://github.com/bh2smith))
- Felix ([fleupold](https://github.com/fleupold))
