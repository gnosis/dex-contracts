import BN from "bn.js";
import { BatchExchangeInstance } from "../types/truffle-typings";

export interface TokenInfo {
  id: number;
  symbol: string;
  decimals: number;
  address: string;
}

const MAXU32 = new BN(2).pow(new BN(32)).sub(new BN(1));

/**
 * Used to recover relevant {@link TokenInfo | TokenInfo} by ID from the exchange such as number of decimals or name.
 * @param exchange - An instance of deployed Batch Exchange Contract
 * @param tokenIds - An array of token ids as listed on the Batch Exchange.
 * @param artifacts - A context-like object providing a gateway to Truffle contract ABIs.
 * @param fallbackSymbolName - A name assigned to the token when if it doesn't exist
 * @param fallbackDecimals - Configurable number of decimals be used when none exists.
 * @returns A mapping of TokenInfo objects fetched from the exchange.
 *   Note that Nullish TokenInfo objects are returned in places where the requested token ID failed to fetch.
 */
export async function fetchTokenInfoFromExchange(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  artifacts: Truffle.Artifacts,
  fallbackSymbolName = "UNKNOWN",
  fallbackDecimals = -1,
): Promise<Map<number, TokenInfo>> {
  const ERC20 = artifacts.require("ERC20Detailed");
  // Fetching token data from EVM
  const tokenObjects: Map<number, TokenInfo> = new Map();
  for (const id of tokenIds) {
    const tokenAddress = await exchange.tokenIdToAddressMap(id);
    let tokenInfo;
    try {
      const tokenInstance = await ERC20.at(tokenAddress);
      tokenInfo = {
        id: id,
        symbol: await tokenInstance.symbol.call(),
        decimals: (await tokenInstance.decimals.call()).toNumber(),
        address: tokenAddress,
      };
    } catch (err) {
      // This generic try-catch is essentially a TokenNotFoundError
      // Could occur when the given ID slot is not occupied by a registered token on the exhchange.
      // Essentially, the return value is a bunch of useless values like
      // {
      //   id: id,
      //   symbol: "UNKNOWN",
      //   decimals: -1,
      //   address: 0x00....0,
      // }
      tokenInfo = {
        id: id,
        symbol: fallbackSymbolName,
        decimals: fallbackDecimals,
        address: tokenAddress,
      };
    }
    tokenObjects.set(id, tokenInfo);
    // Found Token ${tokenInfo.symbol} at ID ${tokenInfo.id} with ${tokenInfo.decimals} decimals`
  }
  return tokenObjects;
}

/**
 * A handy function providing fee token liquidity by placing orders selling the fee token
 * at the specified provision price for each specified token.
 * @param exchange - BatchExchange Smart Contract
 * @param tokenIds - An array of token indices as represented on the exchange
 * @param provisionPrice - Price at which liquidity is to be provided
 * @param sellAmountOwl - Amount of feeToken to be sold
 * @param artifacts - A context-like object providing a gateway to Truffle contract ABIs.
 * @returns Void Promise
 */
export async function placeFeeTokenLiquidityOrders(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  provisionPrice: BN,
  sellAmountOwl: BN,
  artifacts: Truffle.Artifacts,
): Promise<void> {
  const minBuyAmounts = [];
  const validTokenIds = [];
  const feeToken = await fetchTokenInfoFromExchange(exchange, [0], artifacts);
  // This is expected to always be OWL which has 18 digits.
  const feeDigits = feeToken.get(0)?.decimals || 18;
  const tokenInfo = await fetchTokenInfoFromExchange(
    exchange,
    tokenIds,
    artifacts,
  );
  for (const tokenId of tokenIds) {
    const numDigits = tokenInfo.get(tokenId)?.decimals;
    if (numDigits && numDigits != -1) {
      validTokenIds.push(tokenId);
      if (numDigits < feeDigits) {
        minBuyAmounts.push(
          sellAmountOwl
            .mul(provisionPrice)
            .div(new BN(10).pow(new BN(feeDigits - numDigits))),
        );
      } else {
        minBuyAmounts.push(
          sellAmountOwl
            .mul(provisionPrice)
            .mul(new BN(10).pow(new BN(numDigits - feeDigits))),
        );
      }
    }
  }
  const numOrders = validTokenIds.length;
  const batchId = (await exchange.getCurrentBatchId()).toNumber();
  if (numOrders == 0) {
    // No orders added since all tokens sufficiently funded or not found.
    return;
  }
  await exchange.placeValidFromOrders(
    validTokenIds, // buyTokens
    Array(numOrders).fill(0), // sellTokens
    Array(numOrders).fill(batchId + 2), // validFroms (all to begin 2 batches from now)
    Array(numOrders).fill(MAXU32), // validTos
    minBuyAmounts, // buyAmounts
    Array(numOrders).fill(sellAmountOwl), // sellAmount
  );
  // "Placed liquidity sell orders for the following tokens",
  // await Promise.all(
  //   validTokenIds.map(async (i) => await tokenInfo.get(i)?.address),
  // );
}
