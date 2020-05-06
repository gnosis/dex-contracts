import assert from "assert"
import { EventData } from "web3-eth-contract"
import { OrderbookOptions } from "."

/**
 * An ethereum address.
 */
type Address = string

/**
 * An exchange token ID.
 */
type TokenId = number

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
  balances: Map<Address, bigint>

  /**
   * Mapping from a token address to a pending withdrawal.
   */
  pendingWithdrawals: Map<Address, PendingWithdrawal>

  /**
   * All user orders including valid, invalid, cancelled and deleted orders.
   *
   * @remarks
   * Since user order IDs increase by 1 for each new order, an order can be
   * retrieved by ID for an account with `account.orders[orderId]`.
   */
  orders: Order[]
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
  batchId: number

  /**
   * The requested withdrawal amount.
   */
  amount: bigint
}

/**
 * Internal representation of an order.
 */
interface Order {
  buyToken: TokenId
  sellToken: TokenId
  validFrom: number
  validUntil: number | null
  priceNumerator: bigint
  priceDenominator: bigint
  remainingAmount: bigint
}

/**
 * Amount used to signal that an order is an unlimited order.
 */
const UNLIMITED_ORDER_AMOUNT = BigInt(2 ** 128) - BigInt(1)

/**
 * JSON representation of the account state.
 */
export interface AuctionStateJson {
  tokens: { [key: string]: string }
  accounts: {
    [key: string]: {
      balances: { [key: string]: string }
      pendingWithdrawals: { [key: string]: { batchId: number; amount: string } }
      orders: {
        buyToken: TokenId
        sellToken: TokenId
        validFrom: number
        validUntil: number | null
        priceNumerator: string
        priceDenominator: string
        remainingAmount: string
      }[]
    }
  }
}

/**
 * Manage the exchange's auction state by incrementally applying events.
 */
export class AuctionState {
  private lastBlock = -1

  private readonly tokens: Map<TokenId, Address> = new Map()
  private readonly accounts: Map<Address, Account> = new Map()
  private lastSolution?: { submitter: Address; burntFees: bigint }

  constructor(private readonly options: OrderbookOptions) {}

  /**
   * Create an object representation of the current account state for JSON
   * serialization.
   */
  public toJSON(): AuctionStateJson {
    function map2obj<K extends { toString: () => string }, V, T>(
      map: Map<K, V>,
      convert: (value: V) => T
    ): { [key: string]: T } {
      const result: { [key: string]: T } = {}
      for (const [key, value] of map.entries()) {
        result[key.toString()] = convert(value)
      }
      return result
    }

    return {
      tokens: map2obj(this.tokens, (addr) => addr),
      accounts: map2obj(this.accounts, (account) => ({
        balances: map2obj(account.balances, (balance) => balance.toString()),
        pendingWithdrawals: map2obj(account.pendingWithdrawals, (withdrawal) => ({
          ...withdrawal,
          amount: withdrawal.amount.toString(),
        })),
        orders: account.orders.map((order) => ({
          ...order,
          priceNumerator: order.priceNumerator.toString(),
          priceDenominator: order.priceDenominator.toString(),
          remainingAmount: order.remainingAmount.toString(),
        })),
      })),
    }
  }

  /**
   * Retrieves block number the account state is accepting events for.
   */
  public get nextBlock(): number {
    return this.lastBlock + 1
  }

  /**
   * Apply all specified ordered events.
   *
   * @remarks
   * This method expects that once events have been applied up until a certain
   * block number, then no new events for that block number (or an earlier block
   * number) are applied.
   *
   */
  public applyEvents(events: EventData[]): void {
    if (this.options.strict) {
      assertEventsAreAfterBlockAndOrdered(this.lastBlock, events)
    }
    this.lastBlock = events[events.length - 1]?.blockNumber ?? this.lastBlock

    /* eslint-disable no-case-declarations */
    for (const ev of events) {
      const data = ev.returnValues
      switch (ev.event) {
        case "Deposit":
          this.updateBalance(data.user, data.token, (amount) => amount + BigInt(data.amount))
          break
        case "OrderCancellation":
          this.order(data.owner, parseInt(data.id)).validUntil = null
          break
        case "OrderDeletion":
          this.deleteOrder(data.owner, parseInt(data.id))
          break
        case "OrderPlacement":
          const orderId = this.addOrder(data.owner, {
            buyToken: parseInt(data.buyToken),
            sellToken: parseInt(data.sellToken),
            validFrom: parseInt(data.validFrom),
            validUntil: parseInt(data.validUntil),
            priceNumerator: BigInt(data.priceNumerator),
            priceDenominator: BigInt(data.priceDenominator),
            remainingAmount: BigInt(data.priceDenominator),
          })
          if (this.options.strict) {
            assert(orderId == parseInt(data.index), `user ${data.user} order ${data.index} added as the ${orderId}th order`)
          }
          break
        case "SolutionSubmission":
          const submitter = data.submitter
          const burntFees = BigInt(data.burntFees)
          this.updateBalance(submitter, 0, (amount) => amount + burntFees)
          this.lastSolution = { submitter, burntFees }
          break
        case "TokenListing":
          this.addToken(parseInt(data.id), data.token)
          break
        case "Trade":
          this.lastSolution = undefined
          this.updateBalance(data.owner, parseInt(data.sellToken), (amount) => amount - BigInt(data.executedSellAmount))
          this.updateOrderRemainingAmount(
            data.owner,
            parseInt(data.orderId),
            (amount) => amount - BigInt(data.executedSellAmount)
          )
          this.updateBalance(data.owner, parseInt(data.buyToken), (amount) => amount + BigInt(data.executedBuyAmount))
          break
        case "TradeReversion":
          if (this.lastSolution !== undefined) {
            const { submitter, burntFees } = this.lastSolution
            this.updateBalance(submitter, 0, (amount) => amount - burntFees)
            this.lastSolution = undefined
          }
          this.updateBalance(data.owner, parseInt(data.sellToken), (amount) => amount + BigInt(data.executedSellAmount))
          this.updateOrderRemainingAmount(
            data.owner,
            parseInt(data.orderId),
            (amount) => amount + BigInt(data.executedSellAmount)
          )
          this.updateBalance(data.owner, parseInt(data.buyToken), (amount) => amount - BigInt(data.executedBuyAmount))
          break
        case "WithdrawRequest":
          this.setPendingWithdrawal(data.user, data.token, parseInt(data.batchId), BigInt(data.amount))
          break
        case "Withdraw":
          const newBalance = this.updateBalance(data.user, data.token, (amount) => amount - BigInt(data.amount))
          if (this.options.strict) {
            assert(newBalance >= BigInt(0), `overdrew user ${data.user} token ${data.token} balance`)
          }
          this.clearPendingWithdrawal(data.user, data.token)
          break
        default:
          throw new UnhandledEventError(ev)
      }
    }
    /* eslint-enable no-case-declarations */

    if (this.options.strict) {
      assertAccountsAreValid(this.lastBlock, this.accounts.entries())
    }
  }

  /**
   * Adds a token to the account state.
   *
   * @throws If a token with the same ID has already been added.
   */
  private addToken(id: TokenId, addr: Address): void {
    this.tokens.set(id, addr)
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
      assert(token.startsWith("0x") && token.length === 42, `invalid token address ${token}`)
      return token
    } else {
      const tokenAddr = this.tokens.get(token)
      assert(tokenAddr, `missing token ${token}`)
      return tokenAddr as Address
    }
  }

  /**
   * Gets the account data for the specified user, creating an empty one if it
   * does not already exist.
   */
  private account(user: Address): Account {
    let account = this.accounts.get(user)
    if (account === undefined) {
      account = {
        balances: new Map(),
        pendingWithdrawals: new Map(),
        orders: [],
      }
      this.accounts.set(user, account)
    }

    return account
  }

  /**
   * Updates a user's account balance.
   */
  private updateBalance(user: Address, token: TokenId | Address, update: (amount: bigint) => bigint): bigint {
    const tokenAddr = this.tokenAddr(token)
    const balances = this.account(user).balances
    const newBalance = update(balances.get(tokenAddr) || BigInt(0))
    balances.set(tokenAddr, newBalance)
    return newBalance
  }

  /**
   * Sets a pending withdrawal for a user for the specified token and amount.
   */
  private setPendingWithdrawal(user: Address, token: TokenId | Address, batchId: number, amount: bigint): void {
    const tokenAddr = this.tokenAddr(token)
    if (this.options.strict) {
      const existingBatch = this.account(user).pendingWithdrawals.get(tokenAddr)?.batchId
      assert(
        existingBatch === undefined || existingBatch === batchId,
        `pending withdrawal for user ${user} modified from batch ${existingBatch} to ${batchId}`
      )
    }
    this.account(user).pendingWithdrawals.set(tokenAddr, { batchId, amount })
  }

  /**
   * Clears a pending withdrawal.
   */
  private clearPendingWithdrawal(user: Address, token: TokenId | Address): void {
    const tokenAddr = this.tokenAddr(token)
    this.account(user).pendingWithdrawals.delete(tokenAddr)
  }

  /**
   * Adds a user order and returns the order ID of the newly created order.
   */
  private addOrder(user: Address, order: Order): number {
    const userOrders = this.account(user).orders
    userOrders.push(order)
    return userOrders.length - 1
  }

  /**
   * Retrieves an existing user order by user address and order ID.
   *
   * @throws If the order does not exist.
   */
  private order(user: Address, orderId: number): Order {
    const order = this.account(user).orders[orderId]
    assert(order, `attempted to retrieve missing order ${orderId} for user ${user}`)
    return order
  }

  /**
   * Updates a user's order's remaining amount. For unlimited orders, the
   * remaining amount remains unchanged.
   *
   * @throws If the order does not exist.
   */
  private updateOrderRemainingAmount(user: Address, orderId: number, update: (amount: bigint) => bigint): void {
    const order = this.order(user, orderId)
    if (order.priceNumerator !== UNLIMITED_ORDER_AMOUNT && order.priceDenominator !== UNLIMITED_ORDER_AMOUNT) {
      order.remainingAmount = update(order.remainingAmount)
    }
  }

  /**
   * Sets a user's order to all 0's.
   *
   * @throws If the order does not exist.
   */
  private deleteOrder(user: Address, orderId: number): void {
    const order = this.order(user, orderId)
    order.buyToken = 0
    order.sellToken = 0
    order.validFrom = 0
    order.validUntil = 0
    order.priceNumerator = BigInt(0)
    order.priceDenominator = BigInt(0)
    order.remainingAmount = BigInt(0)
  }
}

/**
 * An error that is thrown on a unhandled contract event.
 */
export class UnhandledEventError extends Error {
  constructor(public readonly ev: EventData) {
    super(`unhandled ${ev.event} event`)
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
function assertEventsAreAfterBlockAndOrdered(block: number, events: EventData[]): void {
  let blockNumber = block
  let logIndex = +Infinity
  for (const ev of events) {
    assert(
      blockNumber < ev.blockNumber || (blockNumber === ev.blockNumber && logIndex < ev.logIndex),
      `event ${ev.event} from block ${ev.blockNumber} index ${ev.logIndex} out of order`
    )
    blockNumber = ev.blockNumber
    logIndex = ev.logIndex
  }
}

/**
 * Asserts that all accounts are valid by ensuring that all token balances and
 * order remaining amounts are positive
 *
 * @throws If an account has an invalid amount.
 */
function assertAccountsAreValid(blockNumber: number, accounts: Iterable<[Address, Account]>): void {
  for (const [user, { balances, orders }] of accounts) {
    for (const [token, balance] of balances.entries()) {
      assert(balance >= BigInt(0), `user ${user} token ${token} balance is negative at block ${blockNumber}`)
    }

    for (let id = 0; id < orders.length; id++) {
      const order = orders[id]
      assert(order.remainingAmount >= BigInt(0), `user ${user} order ${id} remaining amount is negative at block ${blockNumber}`)
    }
  }
}
