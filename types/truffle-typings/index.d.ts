/**
 * Include generated truffle typings for tests.
 */

/// <reference types="../../build/truffle-typings/merge" />

export * from "../../build/truffle-typings";

export interface Linkable<T> extends Truffle.Contract<T> {
  link(lib: string, address: string): Promise<void>;
}
