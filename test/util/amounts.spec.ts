import {
  getUnitPrice,
  getOutputAmountFromPrice,
  getUnlimitedOrderAmounts,
} from "../../src/util/amounts";
import BN from "bn.js";
import { assert } from "chai";
import "mocha";

describe("Amounts", () => {
  describe("getUnitPrice", () => {
    it("Evaluates as expected when both have 18 decimals", () => {
      const buyTokenDecimals = 18;
      const sellTokenDecimals = 18;

      const unitPrice = getUnitPrice(100, buyTokenDecimals, sellTokenDecimals);

      console.log(unitPrice);
    });
  });

  describe("getOutputAmountFromPrice", () => {
    it("tests getOutputAmountFromPrice", () => {
      const buyAmount = getOutputAmountFromPrice(1, new BN(1), 1, 1);
      console.log(buyAmount);
    });
  });

  describe("getUnlimitedOrderAmounts", () => {
    it("tests getUnlimitedOrderAmounts", () => {
      const x = getUnlimitedOrderAmounts(1, 1, 1);
      console.log(x.base, x.quote);
    });
  });
});
