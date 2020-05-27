/**
 * Include generated truffle typings for tests.
 */

/// <reference types="../../build/truffle-typings/merge" />

export * from "../../build/truffle-typings";
declare global {
  namespace Truffle {
    interface ScriptCallback {
      (err?: string | Error): void;
    }
  }
}

export interface Linkable<T> extends Truffle.Contract<T> {
  link(lib: string, address: string): Promise<void>;
}
