/**
 * Module containing event based orderbook reading implementation. The entire
 * orderbook is contructed from Ethreum events fetched in two stages: first,
 * the past events are fetched in block-based pages, second an event subsciption
 * is setup to listen to new incomming events that get added to the orderbook
 * snapshot.
 *
 * The streamed orderbook can be queried at any time to get the current open
 * orders (that is orders and balances as it would they would be included for
 * the next batch) or the finalized orderbook (orders and balances that are
 * being considered for trading by the solver).
 *
 * @packageDocumentation
 */

import Web3 from "web3"
import { TransactionReceipt } from "web3-core"
import { EventData } from "web3-eth-contract"
import { BatchExchange, BatchExchangeArtifact } from "../.."
import { AuctionState } from "./state"

/**
 * Configuration options for the streamed orderbook.
 */
export interface OrderbookOptions {
  /**
   * Optinally specify the last block to apply events for. This is useful for
   * testing the streamed orderbook and ensuring that it is producing a correct
   * account state for a known block.
   */
  endBlock?: number;

  /**
   * Set the block page size used to query past events.
   *
   * @remarks
   * Nodes are usually configured to limit the number of events that can be
   * returned by a single call to retrieve past logs (10,000 for Infura)
   * so this parameter should be set accordingly.
   */
  blockPageSize: number;

    /**
   * Sets the number of block confirmations required for an event to be
   * considered confirmed and not be subject to re-orgs.
   */
  blockConfirmations: number;

  /**
   * Sets the polling interval used for querying latest events and updating the
   * current account state.
   */
  pollInterval: number;

  /**
   * Enable strict checking that performs additional integrity checks.
   *
   * @remarks
   * The additional integrity checks have a non-negligible runtime cost so
   * they are disabled by default, but can help diagnose issues and bugs in the
   * streamed orderbook.
   */
  strict: boolean;

  /**
   * Set the logger to be used by the streamed orderbook module.
   */
  logger?: {
    debug: (...args: any) => void;
    log: (...args: any) => void;
    warn: (...args: any) => void;
    error: (...args: any) => void;
  };
}

/**
 * The default orderbook options.
 */
export const DEFAULT_ORDERBOOK_OPTIONS: OrderbookOptions = {
  blockPageSize: 10000,
  blockConfirmations: 6,
  pollInterval: 10000,
  strict: false,
}

/**
 * The duration in seconds of a batch.
 */
export const BATCH_DURATION = 300

/**
 * The streamed orderbook that manages incoming events, and applies them to the
 * account state.
 */
export class StreamedOrderbook {
  private readonly state: AuctionState;

  private updateTimeout?: NodeJS.Timeout;
  private updateError?: Error;
  private pendingEvents: EventData[] = [];

  private constructor(
    private readonly web3: Web3,
    private readonly contract: BatchExchange,
    private readonly startBlock: number,
    private readonly options: OrderbookOptions,
  ) {
    this.state = new AuctionState(options)
  }

  /**
   * Create and return a new streamed orderbook.
   *
   * @remarks
   * This method returns a promise that resolves once all past events have been
   * applied to the current account state and the orderbook.
   *
   * @param web3 - The web3 provider to use.
   * @param options - Optional settings for tweaking the streamed orderbook.
   */
  static async init(
    web3: Web3,
    options: Partial<OrderbookOptions> = {},
  ): Promise<StreamedOrderbook> {
    const [contract, tx] = await batchExchangeDeployment(web3)
    const orderbook = new StreamedOrderbook(
      web3,
      contract,
      tx.blockNumber,
      { ...DEFAULT_ORDERBOOK_OPTIONS, ...options },
    )

    await orderbook.applyPastEvents()

    if (options.endBlock === undefined) {
      await orderbook.applyNewEvents()
      orderbook.scheduleUpdate()
    }

    return orderbook
  }

  /**
   * Stops the orderbook so that it no longer performs any updates.
   *
   * @throws
   * Throws any error that may have occurred when updating and applying new
   * events to the account state.
   */
  public stop(): void {
    if (this.updateError) {
      throw this.updateError
    }

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = undefined
    }
  }

  /**
   * Apply all past events to the account state by querying the node for past
   * events with multiple queries to retrieve each block page at a time.
   */
  private async applyPastEvents(): Promise<void> {
    const endBlock = this.options.endBlock ??
      (await this.web3.eth.getBlockNumber() - this.options.blockConfirmations)

    for (
      let fromBlock = this.startBlock;
      fromBlock < endBlock;
      fromBlock += this.options.blockPageSize
    ) {
      // NOTE: `getPastEvents` block range is inclusive.
      const toBlock = Math.min(
        fromBlock + this.options.blockPageSize - 1,
        endBlock,
      )

      this.options.logger?.debug(`fetching page ${fromBlock}-${toBlock}`)
      const events = await this.contract.getPastEvents(
        "allEvents",
        { fromBlock, toBlock },
      )

      this.options.logger?.debug(`applying ${events.length} past events`)
      this.state.applyEvents(events)
    }
  }

  /**
   * Apply new confirmed events to the account state and store the remaining
   * events that are subject to reorgs into the `pendingEvents` array.
   *
   * @remarks
   * If there is an error retrieving the latest events from the node, then the
   * account state remains unmodified. This allows the updating orderbook to be
   * more fault-tolerant and deal with nodes being temporarily down and some
   * intermittent errors.
   *
   * @throws
   * Throws if there was an error applying the newly confirmed events.
   */
  private async applyNewEvents(): Promise<void> {
    const fromBlock = this.state.nextBlock

    let confirmedEvents: EventData[]
    let pendingEvents: EventData[]
    try {
      this.options.logger?.debug(`fetching new events from ${fromBlock}-latest`)
      const events = await this.contract.getPastEvents("allEvents", { fromBlock })

      const latestBlock = await this.web3.eth.getBlockNumber()
      const confirmedBlock = latestBlock - this.options.blockConfirmations
      const confirmedEventCount = events.findIndex(ev => ev.blockNumber <= confirmedBlock)

      confirmedEvents = events.splice(0, confirmedEventCount)
      pendingEvents = events
    } catch (err) {
      this.options.logger?.warn(`error retrieving new events: ${err}`)
      return
    }

    if (confirmedEvents.length > 0) {
      this.options.logger?.debug(`applying ${confirmedEvents.length} confirmed events`)
      this.state.applyEvents(confirmedEvents)
    }
    this.pendingEvents = pendingEvents
  }

  /**
   * Schedule an orderbook update.
   */
  private scheduleUpdate(): void {
    this.updateTimeout = setTimeout(
      async () => {
        try {
          await this.applyNewEvents()
          if (this.updateTimeout) {
            this.scheduleUpdate()
          }
        } catch (err) {
          this.options.logger?.error(`error applying new events up to block ${this.state.nextBlock - 1}: ${err}`)
          this.updateError = err
        }
      },
      this.options.pollInterval,
    )
  }
}

/**
 * Create a `BatchExchange` contract instance, returning both the web3 contract
 * object as well as the transaction receipt for the contract deployment.
 *
 * @throws If the contract is not deployed on the network the web3 provider is
 * connected to.
 */
async function batchExchangeDeployment(web3: Web3): Promise<[BatchExchange, TransactionReceipt]> {
  const { abi, networks } = BatchExchangeArtifact

  const chainId = await web3.eth.getChainId()
  const network = networks[chainId]
  if (!networks) {
    throw new Error(`not deployed on network with chain ID ${chainId}`)
  }

  const tx = await web3.eth.getTransactionReceipt(network.transactionHash)
  const contract = new web3.eth.Contract(abi as any, network.address)

  return [contract, tx]
}
