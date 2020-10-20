import BN from "bn.js";
import type {
  BatchExchangeInstance,
  TokenOwlInstance,
  Erc20MintableInstance,
} from "../types/truffle-typings";
import type { SolutionSubmission } from "../test/resources/examples/model";
import { factory } from "../src/logging";
const log = factory.getLogger("scripts.util");

export interface ExchangeToken {
  id: number;
  address: string;
}

export async function getBatchExchange(
  artifacts: Truffle.Artifacts,
): Promise<BatchExchangeInstance> {
  const BatchExchange = artifacts.require("BatchExchange");
  return BatchExchange.deployed();
}

export async function getOwl(
  artifacts: Truffle.Artifacts,
): Promise<TokenOwlInstance> {
  const TokenOWL = artifacts.require("TokenOWL");
  const batchExchange = await getBatchExchange(artifacts);
  const owlAddress = await batchExchange.feeToken();

  return TokenOWL.at(owlAddress);
}

async function setAllowance(
  token: TokenOwlInstance | Erc20MintableInstance,
  account: string,
  amount: string | BN,
  exchange: BatchExchangeInstance,
) {
  log.info(
    `Approving BatchExchange at ${exchange.address} for ${amount} token ${token.address}`,
  );
  await token.approve(exchange.address, amount, {
    from: account,
  });
}

export async function setAllowances(
  users: string[],
  amount: string | BN,
  exchange: BatchExchangeInstance,
  tokens: (TokenOwlInstance | Erc20MintableInstance)[],
): Promise<void> {
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      await setAllowance(tokens[j], users[i], amount, exchange);
    }
  }
}

export async function addTokens(
  tokenAddresses: string[],
  account: string,
  exchange: BatchExchangeInstance,
  owl: TokenOwlInstance,
): Promise<ExchangeToken[]> {
  // Get amount of required OWL for listing all tokens
  const feeForAddingToken = await exchange.FEE_FOR_LISTING_TOKEN_IN_OWL();
  const totalFees = feeForAddingToken.mul(new BN(tokenAddresses.length));

  // Ensure the user has enough OWL balance
  const balanceOfOWL = await owl.balanceOf(account);
  if (totalFees.gt(balanceOfOWL)) {
    throw new Error("Insufficient balance of fee token to complete request.");
  }

  // Set OWL allowance if necessary
  const allowanceOfOWL = await owl.allowance(account, exchange.address);
  if (totalFees.gt(allowanceOfOWL)) {
    // TODO: Only approve the minimum required amount totalFees.sub(allowanceOfOWL)
    await setAllowance(owl, account, totalFees, exchange);
  }

  // List all tokens (if not listed previously)
  const tokens = [];
  for (const tokenAddress of tokenAddresses) {
    const isTokenListed = await exchange.hasToken(tokenAddress);

    if (!isTokenListed) {
      await exchange.addToken(tokenAddress, { from: account });
      log.info(`Successfully added token ${tokenAddress}`);
    } else {
      log.info(`The token ${tokenAddress} was already added`);
    }

    // Get token information
    const tokenId = await exchange.tokenAddressToIdMap(tokenAddress);
    tokens.push({
      id: tokenId.toNumber(),
      address: tokenAddress,
    });
  }

  // Return token information
  return tokens;
}

export async function deleteOrders(
  orderIds: number[],
  accounts: string[],
  exchange: BatchExchangeInstance,
): Promise<void> {
  log.info(`Canceling ${orderIds.length} orders for ${accounts.length} users`);
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];
    const account = accounts[i];
    const cancelReceipt = await exchange.cancelOrders([orderId], {
      from: account,
    });
    const events = cancelReceipt.logs
      .map((log: Truffle.TransactionLog<Truffle.AnyEvent>) => log.event)
      .join(", ");
    log.info(
      `Canceled/Deleted order ${orderId} for user {${account}}. Emitted events: ${events}`,
    );
  }
}

export async function submitSolution(
  name: string,
  batchId: number,
  solution: SolutionSubmission,
  solverAddress: string,
  exchange: BatchExchangeInstance,
): Promise<void> {
  log.info(`Submit "${name}":
  - Objective value: ${solution.objectiveValue}
  - Touched orders: ${solution.touchedorderIds.join(", ")}
  - Volumes: ${solution.volumes.join(", ")}
  - Prices: ${solution.prices.join(", ")}
  - Token ids for prices: ${solution.tokenIdsForPrice.join(", ")}`);
  const objectiveValue = await exchange.submitSolution(
    batchId,
    solution.objectiveValue,
    solution.owners,
    solution.touchedorderIds,
    solution.volumes,
    solution.prices,
    solution.tokenIdsForPrice,
    { from: solverAddress },
  );
  log.info(`Transaction for ${name}: ${objectiveValue.tx}`);
}

export async function getBatchId(
  exchange: BatchExchangeInstance,
): Promise<number> {
  const batchId = await exchange.getCurrentBatchId();
  return batchId.toNumber();
}

export async function createMintableToken(
  artifacts: Truffle.Artifacts,
): Promise<Erc20MintableInstance> {
  const ERC20Mintable = artifacts.require("ERC20Mintable");
  return ERC20Mintable.new();
}

async function mintToken(
  token: Erc20MintableInstance,
  account: string,
  amount: string,
  minter: string,
) {
  log.info(
    `Mint ${amount} of token ${token.address} for user ${account}. Using ${minter} as the minter`,
  );
  await token.mint(account, amount, { from: minter });
}

export async function mintTokens(
  tokens: Erc20MintableInstance[],
  users: string[],
  amount: string,
  minter: string,
): Promise<void> {
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < users.length; j++) {
      await mintToken(tokens[i], users[j], amount, minter);
    }
  }
}

async function mintOwlForUser(
  owl: TokenOwlInstance,
  user: string,
  amount: string,
  minter: string,
) {
  log.info(`Mint ${amount} OWL to ${user}`);
  return owl.mintOWL(user, amount, { from: minter });
}

export async function mintOwl(
  owl: TokenOwlInstance,
  users: string[],
  amount: string,
  minter: string,
): Promise<void> {
  for (let i = 0; i < users.length; i++) {
    await mintOwlForUser(owl, users[i], amount, minter);
  }
}
