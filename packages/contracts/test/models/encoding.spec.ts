import {
  decodeOrders,
  decodeIndexedOrders,
  encodeOrders,
  encodeIndexedOrders,
} from "../../src";
import BN from "bn.js";
import { expect } from "chai";
import "mocha";

function hex(bytes: Uint8Array): string {
  return `0x${Array.prototype.map
    .call(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function json(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj));
}

describe("Encoding Orders", () => {
  describe("decodeOrders", () => {
    it("accepts empty bytes and null and as input", () => {
      expect(decodeOrders("")).to.deep.equal([]);
      expect(decodeOrders("0x")).to.deep.equal([]);
      expect(decodeOrders(null)).to.deep.equal([]);
    });
  });

  describe("encodeOrders", () => {
    it("encodes orders that can be decoded into the same values", () => {
      const orders = [
        {
          user: "0x000102030405060708090a0b0c0d0e0f10111213",
          sellTokenBalance: new BN(1),
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: new BN("1000000000000000000"),
          priceDenominator: new BN("1000000000000000000"),
          remainingAmount: new BN(42),
        },
        {
          user: "0x131211100f0e0d0c0b0a09080706050403020100",
          sellTokenBalance: new BN(1),
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: new BN(1337),
          priceDenominator: new BN(0x12345678),
          remainingAmount: new BN(42),
        },
      ];
      const encoded = encodeOrders(orders);
      const decoded = decodeOrders(hex(encoded));
      expect(json(decoded)).to.deep.equal(json(orders));
    });

    it("can encode orders with string integer format", () => {
      const orders = [
        {
          user: "0x000102030405060708090a0b0c0d0e0f10111213",
          sellTokenBalance: "1",
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: "6",
          priceDenominator: "7",
          remainingAmount: "8",
        },
      ];
      const encoded = encodeOrders(orders);
      expect(hex(encoded)).to.equal(
        "0x\
         000102030405060708090a0b0c0d0e0f10111213\
         0000000000000000000000000000000000000000000000000000000000000001\
         0002\
         0003\
         00000004\
         00000005\
         00000000000000000000000000000006\
         00000000000000000000000000000007\
         00000000000000000000000000000008\
        ".replace(
          /\s/g,
          "",
        ),
      );
    });

    it("can encode orders with bigint integer format", () => {
      const orders = [
        {
          user: "0x000102030405060708090a0b0c0d0e0f10111213",
          sellTokenBalance: BigInt(1),
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: BigInt(6),
          priceDenominator: BigInt(7),
          remainingAmount: BigInt(8),
        },
      ];
      const encoded = encodeOrders(orders);
      expect(hex(encoded)).to.equal(
        "0x\
         000102030405060708090a0b0c0d0e0f10111213\
         0000000000000000000000000000000000000000000000000000000000000001\
         0002\
         0003\
         00000004\
         00000005\
         00000000000000000000000000000006\
         00000000000000000000000000000007\
         00000000000000000000000000000008\
        ".replace(
          /\s/g,
          "",
        ),
      );
    });
  });

  describe("encodeIndexedOrders", () => {
    it("encodes indexed orders that can be decoded into the same values", () => {
      const orders = [
        {
          user: "0x000102030405060708090a0b0c0d0e0f10111213",
          sellTokenBalance: new BN(1),
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: new BN("1000000000000000000"),
          priceDenominator: new BN("1000000000000000000"),
          remainingAmount: new BN(42),
          orderId: 99,
        },
        {
          user: "0x131211100f0e0d0c0b0a09080706050403020100",
          sellTokenBalance: new BN(1),
          buyToken: 2,
          sellToken: 3,
          validFrom: 4,
          validUntil: 5,
          priceNumerator: new BN(1337),
          priceDenominator: new BN(0x12345678),
          remainingAmount: new BN(42),
          orderId: 7,
        },
      ];
      const encoded = encodeIndexedOrders(orders);
      const decoded = decodeIndexedOrders(hex(encoded));
      expect(json(decoded)).to.deep.equal(json(orders));
    });
  });
});
