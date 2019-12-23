export interface Order {
  user: string,
  sellTokenBalance: string,
  buyToken: string,
  sellToken: string,
  validFrom: string,
  validUntil: string,
  priceNumerator: string,
  priceDenominator: string,
  remainingAmount: string,
}

export declare function decodeOrders(bytes: string): Order[];
