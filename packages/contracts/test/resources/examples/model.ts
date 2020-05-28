import BN from "bn.js";

export interface Order {
  buyToken: number;
  buyAmount: BN;
  sellToken: number;
  sellAmount: BN;
  user: number;
}

export interface Solution {
  name?: string;
  prices: BN[];
  buyVolumes: BN[];
}

export interface TestCaseInput {
  name?: string;
  deposits?: Deposit[];
  orders: Order[];
  solutions: Solution[];
}

export interface Deposit {
  amount: BN;
  token: number;
  user: number;
}

export interface Token {
  id: number;
  price: BN;
  conservation: BN;
}

export interface ComputedOrder {
  idx: number;
  user: number;
  buy: BN;
  sell: BN;
  utility: BN;
  disregardedUtility: BN;
}

export interface ExecutedAmount {
  buy: BN;
  sell: BN;
}

export interface ObjectiveValueComputation {
  orderExecutedAmounts: ExecutedAmount[]; //The executed amounts per order
  orderTokenConservation: BN[][]; //The token conservation per token per order
  tokenConservation: BN[]; //The token conservation for each token
  utilities: BN[]; //The utility of each order
  disregardedUtilities: BN[]; //The disregarded utility of each order
  totalUtility: BN; //The total utility of all the orders
  totalDisregardedUtility: BN; //The total disregarded utility of all the orders
  burntFees: BN; //The total burnt fees, half of the total fees
  result: BN; //The objective value result
}

export interface ComputedSolution {
  name?: string;
  tokens: Token[];
  orders: ComputedOrder[];
  objectiveValueComputation: ObjectiveValueComputation;
  totalFees: BN;
  totalUtility: BN;
  burntFees: BN;
  objectiveValue: BN;
}

export interface TestCase {
  name?: string;
  numTokens: number;
  deposits: Deposit[];
  orders: Order[];
  solutions: ComputedSolution[];
}

export interface SolutionSubmission {
  objectiveValue: BN;
  owners: string[];
  touchedorderIds: number[];
  volumes: BN[];
  prices: BN[];
  tokenIdsForPrice: number[];
}
