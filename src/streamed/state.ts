import assert from "assert";
import { EventData } from "web3-eth-contract";
import { BatchExchange, IndexedOrder } from "..";
import { OrderbookOptions } from ".";
import { AnyEvent, Event } from "./events";

/**
 * An ethereum address.
 */
type Address = string;

/**
 * An exchange token ID.
 */
type TokenId = number;

/**
 * Internal representation of a user account.
 */
interface Account {
  /**
   * Mapping from a token address to an amount representing the account's total
   * balance in the exchange.
   *
   * @remarks
   * Pending withdrawal amounts are not included in this balance although they
   * affect the available balance of the account.
   */
  balances: Map<Address, bigint>;

  /**
   * Mapping from a token address to a pending withdrawal.
   */
  pendingWithdrawals: Map<Address, PendingWithdrawal>;

  /**
   * All user orders including valid, invalid, cancelled and deleted orders.
   *
   * @remarks
   * Since user order IDs increase by 1 for each new order, an order can be
   * retrieved by ID for an account with `account.orders[orderId]`.
   */
  orders: Order[];
}

/**
 * Internal representation of a pending withdrawal.
 */
interface PendingWithdrawal {
  /**
   * The batch ID when the withdrawal request matures, i.e. the amount is no
   * longer included in the account's available balance and up to the amount can
   * be withdrawn by the user.
   */
  batchId: number;

  /**
   * The requested withdrawal amount.
   */
  amount: bigint;
}

/**
 * Internal representation of an order.
 */
interface Order {
  buyToken: TokenId;
  sellToken: TokenId;
  validFrom: number;
  validUntil: number | null;
  priceNumerator: bigint;
  priceDenominator: bigint;
  remainingAmount: bigint;
}

/**
 * Amount used to signal that an order is an unlimited order.
 */
const UNLIMITED_ORDER_AMOUNT = BigInt(2 ** 128) - BigInt(1);

/**
 * JSON representation of the account state.
 */
export interface AuctionStateJson {
  tokens: string[];
  accounts: {
    [key: string]: {
      balances: { [key: string]: string };
      pendingWithdrawals: {
        [key: string]: { batchId: number; amount: string };
      };
      orders: {
        buyToken: TokenId;
        sellToken: TokenId;
        validFrom: number;
        validUntil: number | null;
        priceNumerator: string;
        priceDenominator: string;
        remainingAmount: string;
      }[];
    };
  };
}

/**
 * Manage the exchange's auction state by incrementally applying events.
 */
export class AuctionState {
  private lastBlock = -1;

  private readonly tokens: Address[] = [];
  private readonly accounts: Map<Address, Account> = new Map();
  private lastSolution?: Event<BatchExchange, "SolutionSubmission">;

  constructor(private readonly options: OrderbookOptions) {}

  /**
   * Creates a copy of the auction state that can apply events independently
   * without modifying the original state.
   */
  public copy(): AuctionState {
    const clone = new AuctionState(this.options);
    clone.lastBlock = this.lastBlock;
    clone.tokens.push(...this.tokens);
    for (const [user, account] of this.accounts.entries()) {
      clone.accounts.set(user, {
        balances: new Map(account.balances),
        pendingWithdrawals: new Map(account.pendingWithdrawals),
        orders: account.orders.map((order) => ({ ...order })),
      });
    }
    clone.lastSolution = this.lastSolution;

    return clone;
  }

  /**
   * Create an object representation of the current account state for JSON
   * serialization.
   */
  public toJSON(): AuctionStateJson {
    function map2obj<K extends { toString: () => string }, V, T>(
      map: Map<K, V>,
      convert: (value: V) => T,
    ): { [key: string]: T } {
      const result: { [key: string]: T } = {};
      for (const [key, value] of map.entries()) {
        result[key.toString()] = convert(value);
      }
      return result;
    }

    return {
      tokens: this.tokens.slice(0),
      accounts: map2obj(this.accounts, (account) => ({
        balances: map2obj(account.balances, (balance) => balance.toString()),
        pendingWithdrawals: map2obj(
          account.pendingWithdrawals,
          (withdrawal) => ({
            ...withdrawal,
            amount: withdrawal.amount.toString(),
          }),
        ),
        orders: account.orders.map((order) => ({
          ...order,
          priceNumerator: order.priceNumerator.toString(),
          priceDenominator: order.priceDenominator.toString(),
          remainingAmount: order.remainingAmount.toString(),
        })),
      })),
    };
  }

  /**
   * Gets the current auction state in the standard order list format.
   *
   * @param batch - The batch to get the orders for.
   */
  public getOrders(batch: number): IndexedOrder<bigint>[] {
    let orders: IndexedOrder<bigint>[] = [];
    for (const [user, account] of this.accounts.entries()) {
      orders = orders.concat(
        account.orders
          .map((order, orderId) => ({
            ...order,
            user,
            sellTokenBalance: this.getEffectiveBalance(
              batch,
              user,
              order.sellToken,
            ),
            orderId,
            validUntil: order.validUntil ?? 0,
          }))
          .filter(
            (order) => order.validFrom <= batch && batch <= order.validUntil,
          ),
      );
    }

    return orders;
  }

  /**
   * Retrieves a users effective balance for the specified token at a given
   * batch.
   *
   * @param batch - The batch to get the balance for.
   * @param user - The user account to retrieve the balance for.
   * @param token - The token ID or address to retrieve the balance for.
   */
  private getEffectiveBalance(
    batch: number,
    user: Address,
    token: Address | TokenId,
  ): bigint {
    const tokenAddr = this.tokenAddr(token);
    const account = this.accounts.get(user);
    if (account === undefined) {
      return BigInt(0);
    }

    const balance = account.balances.get(tokenAddr) ?? BigInt(0);
    const withdrawal = account.pendingWithdrawals.get(tokenAddr);
    const withdrawalAmount =
      withdrawal && withdrawal.batchId <= batch ? withdrawal.amount : BigInt(0);

    return balance > withdrawalAmount ? balance - withdrawalAmount : BigInt(0);
  }

  /**
   * Retrieves block number the account state is accepting events for.
   */
  public get nextBlock(): number {
    return this.lastBlock + 1;
  }

  /**
   * Apply all specified ordered events.
   *
   * @remarks
   * This method expects that once events have been applied up until a certain
   * block number, then no new events for that block number (or an earlier block
   * number) are applied.
   */
  public applyEvents(events: AnyEvent<BatchExchange>[]): void {
    if (this.options.strict) {
      assertEventsAreAfterBlockAndOrdered(this.lastBlock, events);
    }
    this.lastBlock = events[events.length - 1]?.blockNumber ?? this.lastBlock;

    for (const ev of events) {
      switch (ev.event) {
        case "Deposit":
          this.applyDeposit(ev.returnValues);
          break;
        case "OrderCancellation":
          this.applyOrderCancellation(ev.returnValues);
          break;
        case "OrderDeletion":
          this.applyOrderDeletion(ev.returnValues);
          break;
        case "OrderPlacement":
          this.applyOrderPlacement(ev.returnValues);
          break;
        case "SolutionSubmission":
          this.applySolutionSubmission(ev.returnValues);
          this.lastSolution = ev.returnValues;
          break;
        case "TokenListing":
          this.applyTokenListing(ev.returnValues);
          break;
        case "Trade":
          this.lastSolution = undefined;
          this.applyTrade(ev.returnValues);
          break;
        case "TradeReversion":
          if (this.lastSolution !== undefined) {
            this.applySolutionReversion(this.lastSolution);
            this.lastSolution = undefined;
          }
          this.applyTradeReversion(ev.returnValues);
          break;
        case "WithdrawRequest":
          this.applyWithdrawRequest(ev.returnValues);
          break;
        case "Withdraw":
          this.applyWithdraw(ev.returnValues);
          break;
        default:
          throw new UnhandledEventError(ev);
      }
    }
  }

  /**
   * Applies a deposit event to the auction state.
   */
  private applyDeposit({
    user,
    token,
    amount: depositAmount,
  }: Event<BatchExchange, "Deposit">): void {
    this.updateBalance(user, token, (amount) => amount + BigInt(depositAmount));
  }

  /**
   * Applies an order cancellation event to the auction state.
   */
  private applyOrderCancellation({
    owner,
    id,
  }: Event<BatchExchange, "OrderCancellation">): void {
    // TODO(nlordell): We need to pre-fetch the batch ID based on the block
    // number for this event to be able to accurately set this value.
    this.order(owner, parseInt(id)).validUntil = null;
  }

  /**
   * Applies an order deletion event to the auction state.
   */
  private applyOrderDeletion({
    owner,
    id,
  }: Event<BatchExchange, "OrderDeletion">): void {
    const order = this.order(owner, parseInt(id));
    order.buyToken = 0;
    order.sellToken = 0;
    order.validFrom = 0;
    order.validUntil = 0;
    order.priceNumerator = BigInt(0);
    order.priceDenominator = BigInt(0);
    order.remainingAmount = BigInt(0);
  }

  /**
   * Applies an order placement event to the auction state.
   *
   * @throws
   * In strict mode, throws if the order ID from the event does not match the
   * expected order ID based on the number of previously placed orders.
   */
  private applyOrderPlacement(
    order: Event<BatchExchange, "OrderPlacement">,
  ): void {
    const userOrders = this.account(order.owner).orders;
    const orderId = userOrders.length;
    if (this.options.strict) {
      assert(
        orderId == parseInt(order.index),
        `user ${order.owner} order ${order.index} added as the ${orderId}th order`,
      );
    }

    userOrders.push({
      buyToken: parseInt(order.buyToken),
      sellToken: parseInt(order.sellToken),
      validFrom: parseInt(order.validFrom),
      validUntil: parseInt(order.validUntil),
      priceNumerator: BigInt(order.priceNumerator),
      priceDenominator: BigInt(order.priceDenominator),
      remainingAmount: BigInt(order.priceDenominator),
    });
  }

  /**
   * Applies an emulated solution reversion event.
   */
  private applySolutionReversion({
    submitter,
    burntFees,
  }: Event<BatchExchange, "SolutionSubmission">): void {
    this.updateBalance(submitter, 0, (amount) => amount - BigInt(burntFees));
  }

  /**
   * Applies a solution submission event to the auction state.
   *
   * @throws
   * In strict mode, throws if the account balances are left in an invalid state
   * while applying a solution. This check has to be done after applying all
   * trades, as a user balance can temporarily go below 0 when a solution is
   * being applied.
   */
  private applySolutionSubmission({
    submitter,
    burntFees,
  }: Event<BatchExchange, "SolutionSubmission">): void {
    this.updateBalance(submitter, 0, (amount) => amount + BigInt(burntFees));
    if (this.options.strict) {
      for (const [user, { balances }] of this.accounts.entries()) {
        for (const [token, balance] of balances.entries()) {
          assert(
            balance >= BigInt(0),
            `user ${user} token ${token} balance is negative`,
          );
        }
      }
    }
  }

  /**
   * Applies a token listing event and adds a token to the account state.
   *
   * @throws
   * In strict mode, throws either if the token has already been listed or if
   * it was listed out of order.
   */
  private applyTokenListing({
    id,
    token,
  }: Event<BatchExchange, "TokenListing">): void {
    if (this.options.strict) {
      assert(
        this.tokens.length === parseInt(id),
        `token ${token} with ID ${id} added as token ${this.tokens.length}`,
      );
    }

    this.tokens.push(token);
  }

  /**
   * Applies a trade event to the auction state.
   */
  private applyTrade(trade: Event<BatchExchange, "Trade">): void {
    this.updateBalance(
      trade.owner,
      parseInt(trade.sellToken),
      (amount) => amount - BigInt(trade.executedSellAmount),
    );
    this.updateOrderRemainingAmount(
      trade.owner,
      parseInt(trade.orderId),
      (amount) => amount - BigInt(trade.executedSellAmount),
    );
    this.updateBalance(
      trade.owner,
      parseInt(trade.buyToken),
      (amount) => amount + BigInt(trade.executedBuyAmount),
    );
  }

  /**
   * Applies a trade reversion event to the auction state.
   */
  private applyTradeReversion(
    trade: Event<BatchExchange, "TradeReversion">,
  ): void {
    this.updateBalance(
      trade.owner,
      parseInt(trade.sellToken),
      (amount) => amount + BigInt(trade.executedSellAmount),
    );
    this.updateOrderRemainingAmount(
      trade.owner,
      parseInt(trade.orderId),
      (amount) => amount + BigInt(trade.executedSellAmount),
    );
    this.updateBalance(
      trade.owner,
      parseInt(trade.buyToken),
      (amount) => amount - BigInt(trade.executedBuyAmount),
    );
  }

  /**
   * Applies a withdraw event to the auction state.
   *
   * @throws
   * In strict mode, throws if the withdrawing user's balance would be overdrawn
   * as a result of this event.
   */
  private applyWithdraw({
    user,
    token,
    amount: withdrawAmount,
  }: Event<BatchExchange, "Withdraw">): void {
    const tokenAddr = this.tokenAddr(token);
    const newBalance = this.updateBalance(
      user,
      token,
      (amount) => amount - BigInt(withdrawAmount),
    );

    if (this.options.strict) {
      assert(
        newBalance >= BigInt(0),
        `overdrew user ${user} token ${token} balance`,
      );
    }

    this.account(user).pendingWithdrawals.delete(tokenAddr);
  }

  /**
   * Applies a withdraw request event to the auction state.
   *
   * @throws
   * In strict mode, throws if the withdraw request is placed over top of an
   * existing unapplied request.
   */
  private applyWithdrawRequest({
    user,
    token,
    batchId,
    amount,
  }: Event<BatchExchange, "WithdrawRequest">): void {
    const tokenAddr = this.tokenAddr(token);
    const batch = parseInt(batchId);

    if (this.options.strict) {
      const existingBatch = this.account(user).pendingWithdrawals.get(tokenAddr)
        ?.batchId;
      assert(
        existingBatch === undefined || existingBatch === batch,
        `pending withdrawal for user ${user} modified from batch ${existingBatch} to ${batchId}`,
      );
    }

    this.account(user).pendingWithdrawals.set(tokenAddr, {
      batchId: batch,
      amount: BigInt(amount),
    });
  }

  /**
   * Normalizes a token ID or address to a token address.
   *
   * @throws If the token address is an invalid address or if the token id is
   * not registered. This is done because event token IDs and addresses are both
   * strings and can both be parsed into integers which is hard to enforce with
   * just type-safety.
   */
  private tokenAddr(token: TokenId | Address): Address {
    if (typeof token === "string") {
      assert(
        token.startsWith("0x") && token.length === 42,
        `invalid token address ${token}`,
      );
      return token;
    } else {
      const tokenAddr = this.tokens[token];
      assert(tokenAddr !== undefined, `missing token ${token}`);
      return tokenAddr;
    }
  }

  /**
   * Gets the account data for the specified user, creating an empty one if it
   * does not already exist.
   */
  private account(user: Address): Account {
    let account = this.accounts.get(user);
    if (account === undefined) {
      account = {
        balances: new Map(),
        pendingWithdrawals: new Map(),
        orders: [],
      };
      this.accounts.set(user, account);
    }

    return account;
  }

  /**
   * Updates a user's account balance.
   */
  private updateBalance(
    user: Address,
    token: TokenId | Address,
    update: (amount: bigint) => bigint,
  ): bigint {
    const tokenAddr = this.tokenAddr(token);
    const balances = this.account(user).balances;
    const newBalance = update(balances.get(tokenAddr) || BigInt(0));
    balances.set(tokenAddr, newBalance);
    return newBalance;
  }

  /**
   * Retrieves an existing user order by user address and order ID.
   *
   * @throws If the order does not exist.
   */
  private order(user: Address, orderId: number): Order {
    const order = this.account(user).orders[orderId];
    assert(
      order,
      `attempted to retrieve missing order ${orderId} for user ${user}`,
    );
    return order;
  }

  /**
   * Updates a user's order's remaining amount. For unlimited orders, the
   * remaining amount remains unchanged.
   *
   * @throws If the order does not exist.
   */
  private updateOrderRemainingAmount(
    user: Address,
    orderId: number,
    update: (amount: bigint) => bigint,
  ): void {
    const order = this.order(user, orderId);
    if (
      order.priceNumerator !== UNLIMITED_ORDER_AMOUNT &&
      order.priceDenominator !== UNLIMITED_ORDER_AMOUNT
    ) {
      order.remainingAmount = update(order.remainingAmount);
      if (this.options.strict) {
        assert(
          order.remainingAmount >= BigInt(0),
          `user ${user} order ${orderId} remaining amount is negative`,
        );
      }
    }
  }
}

/**
 * An error that is thrown on a unhandled contract event.
 */
export class UnhandledEventError extends Error {
  constructor(public readonly ev: EventData) {
    super(`unhandled ${ev.event} event`);
  }
}

/**
 * Asserts that the specified array of events are in order by ensuring that both
 * block numbers and log indices are monotonically increasing and that they all
 * come after the specified block.
 *
 * @param block - The block number that all events must come after
 * @param events - The array of events to check order and batch
 */
function assertEventsAreAfterBlockAndOrdered(
  block: number,
  events: EventData[],
): void {
  let blockNumber = block;
  let logIndex = +Infinity;
  for (const ev of events) {
    assert(
      blockNumber < ev.blockNumber ||
        (blockNumber === ev.blockNumber && logIndex < ev.logIndex),
      `event ${ev.event} from block ${ev.blockNumber} index ${ev.logIndex} out of order`,
    );
    blockNumber = ev.blockNumber;
    logIndex = ev.logIndex;
  }
}
