import BN from "bn.js";
import type { BatchExchangeInstance } from "../types/truffle-typings";
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
): Promise<Truffle.ContractInstance> {
  const TokenOWL = artifacts.require("TokenOWL");
  const batchExchange = await getBatchExchange(artifacts);
  const owlAddress = await batchExchange.feeToken();

  return TokenOWL.at(owlAddress);
}

async function setAllowance(
  token: Truffle.ContractInstance,
  account: string,
  amount: BN,
  batchExchange: BatchExchangeInstance,
) {
  log.info(
    `Approving BatchExchange at ${batchExchange.address} for ${amount} of token ${token.address}`,
  );
  await token.contract.methods.approve(batchExchange.address, amount, {
    from: account,
  });
}

export async function addTokens(
  tokenAddresses: string[],
  account: string,
  batchExchange: BatchExchangeInstance,
  owl: Truffle.ContractInstance,
): Promise<ExchangeToken[]> {
  // Get amount of required OWL for listing all tokens
  const feeForAddingToken = await batchExchange.FEE_FOR_LISTING_TOKEN_IN_OWL();
  const totalFees = feeForAddingToken.mul(new BN(tokenAddresses.length));

  // Ensure the user has enough OWL balance
  const balanceOfOWL = await owl.contract.methods.balanceOf(account);
  if (totalFees.gt(balanceOfOWL)) {
    throw new Error("Insufficient balance of fee token to complete request.");
  }

  // Set OWL allowance if necessary
  const allowanceOfOWL = await owl.contract.methods.allowance(
    account,
    batchExchange.address,
  );
  if (totalFees.gt(allowanceOfOWL)) {
    // TODO: Only approve the minimum required amount totalFees.sub(allowanceOfOWL)
    await setAllowance(owl, account, totalFees, batchExchange);
  }

  // List all tokens (if not listed previously)
  const tokens = [];
  for (const tokenAddress of tokenAddresses) {
    const isTokenListed = await batchExchange.hasToken(tokenAddress);

    if (!isTokenListed) {
      await batchExchange.addToken(tokenAddress);
      log.info(`Successfully added token ${tokenAddress}`);
    } else {
      log.info(`The token ${tokenAddress} was already added`);
    }

    // Get token information
    const tokenId = await batchExchange.tokenAddressToIdMap(tokenAddress);
    tokens.push({
      id: tokenId.toNumber(),
      address: tokenAddress,
    });
  }

  // Return token information
  return tokens;
}

export function parseArgs(): string[] {
  const args = process.argv.slice(4);
  const index = args.indexOf("--network");
  if (index > -1) {
    args.splice(index, 2);
  }
  return args;
}
