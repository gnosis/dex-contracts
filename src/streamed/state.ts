import assert from 'assert'
import { EventData } from 'web3-eth-contract'
import { OrderbookOptions } from '.'

/**
 * Manage the exchange's account state by incrementally applying events.
 */
export class AccountState {
  private lastBlock: number = -1;

  constructor(
    private readonly options: OrderbookOptions,
  ) {}

  /**
   * Apply specified ordered events.
   *
   * @remarks
   * This method expects that once events have been applied up until a certain
   * block, then no new events from that block (or an earlier block) will be
   * applied.
   */
  public applyEvents(events: EventData[]): void {
    if (this.options.strict) {
      assertEventsAreAfterBlockAndOrdered(this.lastBlock, events)
    }
    this.lastBlock = events[events.length - 1]?.blockNumber || this.lastBlock

    // TODO(nlordell): Actually apply events to state.
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
      `event ${ev.event} from block ${ev.blockNumber} index ${ev.logIndex} out of order`,
    )
    blockNumber = ev.blockNumber
    logIndex = ev.logIndex
  }
}
