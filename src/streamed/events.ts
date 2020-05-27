import type { EventEmitter } from "events";
import type { EventLog } from "web3-core";
import type {
  BaseContract,
  Callback,
  ContractEventLog,
  EventOptions,
} from "../../build/types/types";

/**
 * Contract event function type.
 */
export type ContractEvent<T> = {
  (cb?: Callback<ContractEventLog<T>>): EventEmitter;
  (options?: EventOptions, cb?: Callback<ContractEventLog<T>>): EventEmitter;
};

/**
 * Event data type specified by name.
 */
export type Event<
  C extends BaseContract,
  T extends Exclude<keyof C["events"], "allEvents">
> = EventValues<C["events"][T]>;

/**
 * Concrete event type with known properties based on the event name.
 *
 * @remarks
 * This type definition allows the TypeScript compiler to determine the type of
 * the `returnValues` property based on `event` property checks. For example:
 * ```
 * const eventData: AnyEvent<BatchExchange> = ...
 * switch (eventData.event) {
 * case "Token":                              // ERR: 2678: Type '"Token"' is not comparable to type
 *                                            // '"OrderPlacement" | "TokenListing" | ...'
 *   break
 * case "OrderPlacement":
 *   eventData.returnValues.buyToken = "asdf" // OK
 *   break
 * case "Withdraw":
 *   eventData.returnValues.buyToken = "asdf" // ERR: 2339: Property 'buyToken' does not exist on type
 *                                            // '{ user: string; token: string; amount: string; ... }'.
 *   break
 * }
 * ```
 */
export type AnyEvent<C extends BaseContract> = EventMetadata &
  EventDiscriminant<C, Exclude<keyof C["events"], "allEvents">>;

export type EventMetadata = Omit<EventLog, "event">;
export type EventName<C extends BaseContract> = Exclude<
  keyof C["events"],
  "allEvents"
>;
export type EventValues<T> = T extends ContractEvent<infer U> ? U : never;
export type EventDiscriminant<
  C extends BaseContract,
  T extends EventName<C>
> = T extends unknown
  ? {
      event: T;
      returnValues: EventValues<C["events"][T]>;
    }
  : never;
