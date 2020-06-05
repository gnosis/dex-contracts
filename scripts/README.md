# Script Usage

This directory contains a mix of a few different types of scripts that are useful for interacting with the Gnosis Protocol in several different envronments (i.e. Mainnet, Rinkeby & Development) and for a variety of different purposes such as

1. **Elementary Interactions** (e.g. token listing, deposit, request and claim withdraw, order placement and cancellation)
2. **Data Querying** (invoke view functions, get auction elements, transitive orderbook)
3. **Involved Interactions** (add token list, ensure owl liquidity, place spread orders)
4. **Development Interactions** (wait seconds, close auction, setup environment, setup thegraph data)

Below, we will provide a short description of each script's use case and an example of how it can/should be run.

## Prerequisites

The scripts require the following software installed: [git](https://git-scm.com/), [node](https://nodejs.org/en/) and [yarn](https://yarnpkg.com/).

The Gnosis Protocol contracts must be compiled and the deployment addresseses injected into built contract-artifacts.
To do so, from within this project directory, run

```
yarn prepack
```

## Elementary Interactions

As most of these interactions are self explanitory, we simply provide some example commands to show the required script arguments.

Note that, when using any non-development networks, there must be either a `PK` or `MNEMONIC` phrase corresponding to an account with sufficient ether balance for transaction fees. If neither of these is specified, the default values (contained in `truffle-config.js`) will be used.

### Place Order

```sh
yarn truffle-exec scripts/place_order.js --accountId=0 --buyToken=1 --sellToken=0 --minBuy=1 --maxSell=2 --validFor=5 --network=rinkeby
```

### Deposit

Note that the deposit script will submit two transactions; first to the ERC20 token approving the exchange for transfer and second to the exchange for deposit.

```sh
yarn truffle-exec scripts/deposit.js --accountId=0 --tokenId=0 --amount=30 --network=rinkeby
```

### Request Withdraw

```sh
yarn truffle-exec scripts/request_withdraw.js --accountId=0 --tokenId=0 --amount=30 --network=rinkeby
```

### Claim Withdraw

According to the protocol, one must wait until the batch in which the withdraw request was made has closed (at most 5 minutes) before the requested amount becomes claimable. One helpful script for determining when a request claimable is contained in the next section on data querying

```sh
yarn truffle-exec scripts/claim_withdraw.js --accountId=0 --tokenId=0 --network=rinkeby
```

## Data Querying

Many of these scripts were made for easy exposure to some of the relevant information stored on the EVM. These have proven useful in scenarios of end-to-end testing and integration project via bash scripting. Unfortunately, due to scalability issues and node request limits and (as a result) execution times, scripts like `get_auction_elements.ts` are no longer feasible for mainnet or even testnet querying.

### Invoke view function

This is a fairly practical way to easily access on chain information from your shell. For example, from above, you might want to know how many seconds are remaining in the current batch befoer your withdraw request becomes available:

```sh
yarn truffle-exec scripts/invoke_view_function.js --network mainnet getSecondsRemainingInBatch
```

Some other potentially useful calls might be,

```sh
yarn truffle-exec scripts/invoke_view_function.js --network mainnet getCurrentBatchId
yarn truffle-exec scripts/invoke_view_function.js --network mainnet tokenIdToAddressMap 1
```

Note that any additional arguments that should be passing into the view function should appear in order

### Get Auction Elements

This will return a human readable list of all orders meeting the simple search criteria provided via the following (optional) script arguments

```sh
yarn truffle-exec scripts/get_auction_elements.js --network rinkeby --expired true --covered false --tokens 0,1,2,3,4 --pageSize 50
```

Be warned that this may take a while!

### Transitive Orderbook

Computes a price at which the given amount of `sellToken` can be sold for `buyToken` given the orderbook of the batch that is currently collecting orders.

```sh
yarn truffle-exec scripts/transitive_orderbook.js --network rinkeby --sellToken 1 --buyToken 4 --sellAmount 1000
```

with additional optional agruments such as `hops` and `pageSize`

## Involved Transactions

### Add Token List

This script is usually only needed upon initial deployment of a new BatchExchange contract to any network. It will then fetch a currated list of ERC20 tokens and register each of these for excahnge on the newly deployed contract.

```sh
yarn truffle-exec scripts/add_token_list.js
```

### Ensure OWL Liquidity

This is meant to check and ensure that there are orders selling OWL at an appropriate price between all listed token on the exchange. Note, that this will place orders if there is not enough liquidity.

```sh
yarn truffle-exec scripts/ensure_owl_liquidity.js --network rinkeby
```

### Place Spread Orders

This script is meant to be used with a token list of only stable tokens that are all valued essentially equally. This will place orders with configurable spread between each token pair listed. This script will inform the user of the orders that about to be placed and between which tokens and end with a user prompt confirming that the order placement transaction should be sent.

Note that any undesired order placements can be cancelled using the `cancel_order` script along with the order Ids logged as a result of this script's execution. Furthermore, when default values for `validFrom` are used, the orders will not become valid for three batches (to allow ampel time for cancellation).

```sh
yarn truffle-exec scripts/place_spread_orders.js  --tokens 2,3,6 --network rinkeby
```

## Development Interactions

These scripts serve as easy-access development tooling on ganache. Some of the simplest two are `wait_seconds` and `close_auction` which do exactly this. In fact, `close_auction` is just the combination of `wait_seconds` with the number of seconds remaining in the current batch (acquired via `invoke_view_function` as in the example above).

None of the development scripts will work on any live ethereum networks since they all rely on two features exclusive to ganache (i.e. `evm_mine` and `evm_increaseTime`) do not exhibit the ability to increase time, or trivially mine blocks.

Before executing any of these scripts, please ensure you have a running instance of ganache (with a gas limit of at least 8e6) and that the appropriate contracts have been deployed to your local network

```sh
# Terminal 1
yarn ganache
# Terminal 2
truffle migrate
```

### Setup Environment

In general, setting up an account (from scratch) that is prepared to fully interact with the BatchExchange contract, there are several phases that must be completed. In brief, we must

- Deploy ERC20 tokens to the development network and mint some to a user
- Register these newly minted tokens on the exchange
- Approve the exchange contract and Deposit

The setup environment script takes care of all this all in a single script with configurable number of tokens and accounts to be funded (default is 3 accounts and 3 tokens).

```sh
yarn truffle-exec scripts/ganache/setup_environment.js
```

### Setup The Graph Data

This script was custom written for the (dex-subgraph)[https://github.com/gnosis/dex-subgraph] repo in order to make the contract emit every single event that it possibly can. The purpose here is for end-to-end testing the event listener.

This script is quite a bit more involved than environment setup above as it not only registers tokens and funds accounts on the exchange, but also places orders, submits solutions to auctions and really touches all corners of the smart contract (from the perspective of event emmision). More explicit details of this script are logged during execution:

```sh
yarn truffle-exec scripts/ganache/setup_thegraph_data.js
```

Finally, for completeness, we include the last two scripts

### Wait Seconds

```sh
yarn truffle-exec scripts/ganache/wait_seconds.js  10
```

### Close Auction

```sh
yarn truffle-exec scripts/ganache/close_auction.js
```
