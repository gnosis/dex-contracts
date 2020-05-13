import type { Contract, EventData } from "web3-eth-contract";
import type { ContractEvent } from "../../build/types/types";

/**
 * Event data type specified by name.
 */
export type Event<
  C extends Contract,
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
export type AnyEvent<C extends Contract> = EventMetadata &
  EventDiscriminant<C, Exclude<keyof C["events"], "allEvents">>;

export type EventMetadata = Omit<EventData, "event" | "returnValues">;
export type EventName<C extends Contract> = Exclude<
  keyof C["events"],
  "allEvents"
>;
export type EventValues<T> = T extends ContractEvent<infer U> ? U : never;
export type EventDiscriminant<
  C extends Contract,
  T extends EventName<C>
> = T extends {}
  ? {
      event: T;
      returnValues: EventValues<C["events"][T]>;
    }
  : never;
