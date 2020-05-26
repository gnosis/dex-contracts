import BN from "bn.js";
import { TokenInfo } from "../src";
import { BatchExchangeInstance } from "../types/truffle-typings";

const MAXU32 = new BN(2).pow(new BN(32)).sub(new BN(1));

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
 *
 * @param exchange - BatchExchange smart contract
 * @param tokenIds - An array of token indices as represented by exchange
 * @param provisionPrice - Price at which liquidity is to be provided
 * @param auctionIndex - The auction in which the order should be placed
 */
export async function sendLiquidityOrders(
  exchange: BatchExchangeInstance,
  tokenIds: number[],
  provisionPrice: BN,
  sellAmountOwl: BN,
  artifacts: Truffle.Artifacts,
  owlDigits = 18,
): Promise<void> {
  const minBuyAmount = [];
  const validTokenIds = [];
  const tokenInfo = await fetchTokenInfoFromExchange(
    exchange,
    tokenIds,
    artifacts,
  );
  for (const tokenId of tokenIds) {
    const numDigits = tokenInfo.get(tokenId)?.decimals;
    if (numDigits && numDigits != -1) {
      validTokenIds.push(tokenId);
      if (numDigits < owlDigits) {
        minBuyAmount.push(
          sellAmountOwl
            .mul(provisionPrice)
            .div(new BN(10).pow(new BN(owlDigits - numDigits))),
        );
      } else {
        minBuyAmount.push(
          sellAmountOwl
            .mul(provisionPrice)
            .mul(new BN(10).pow(new BN(numDigits - owlDigits))),
        );
      }
    }
  }
  const numOrders = validTokenIds.length;
  const batchId = (await exchange.getCurrentBatchId()).toNumber();
  if (numOrders == 0) {
    // No liquidity orders added, as all tokens sufficiently funded, or their decimals could not be determined",
    return;
  }
  await exchange.placeValidFromOrders(
    validTokenIds, // sellToken
    Array(numOrders).fill(0), // buyToken always OWL?
    Array(numOrders).fill(batchId + 2), // validFrom
    Array(numOrders).fill(MAXU32), // validTo
    minBuyAmount, // buyAmount
    Array(numOrders).fill(sellAmountOwl), // sellAmount
  );
  // "Placed liquidity sell orders for the following tokens",
  // await Promise.all(
  //   validTokenIds.map(async (i) => await tokenInfo.get(i)?.address),
  // );
}
