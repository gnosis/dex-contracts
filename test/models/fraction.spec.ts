import {Fraction} from "../../src/fraction";
import BN from "bn.js";
import {assert} from "chai";
import "mocha";

const tenPow18 = new BN(10).pow(new BN(18));

describe("Fraction", () => {
  describe("constructor", () => {
    it("Can be created with either BN or number", () => {
      const f1 = new Fraction(1, 2);
      assert.equal(f1.toNumber(), 0.5);

      const f2 = new Fraction(1, new BN(4));
      assert.equal(f2.toNumber(), 0.25);

      const f3 = new Fraction(new BN(1), 8);
      assert.equal(f3.toNumber(), 0.125);

      const f4 = new Fraction(new BN(2), new BN(1));
      assert.equal(f4.toNumber(), 2);
    });
    it("Cannot be created with 0 denominator", () => {
      assert.throws(() => {
        new Fraction(42, 0);
      });
    });
    it("Can be created with 0 numerator", () => {
      const f = new Fraction(0, 4);
      assert.isTrue(f.isZero());
    });
  });

  describe("gt/lt", () => {
    it("return true/false if left greater than right", () => {
      const f1 = new Fraction(tenPow18.add(new BN(10).pow(new BN(16))), 1);
      const f2 = new Fraction(tenPow18, 1);
      assert.isTrue(f1.gt(f2));
      assert.isFalse(f1.lt(f2));
    });

    it("return false/true if left smaller than right", () => {
      const f1 = new Fraction(tenPow18, 1);
      const f2 = new Fraction(tenPow18.add(new BN(10).pow(new BN(16))), 1);
      assert.isFalse(f1.gt(f2));
      assert.isTrue(f1.lt(f2));
    });

    it("return false/false if left equal to right", () => {
      const f1 = new Fraction(tenPow18, 1);
      const f2 = new Fraction(tenPow18, 1);
      assert.isFalse(f1.gt(f2));
      assert.isFalse(f1.lt(f2));
    });
  });

  describe("inverted", () => {
    it("returns the reciprocal of the given fraction", () => {
      const f = new Fraction(new BN(2).mul(tenPow18), tenPow18);
      assert.equal(f.inverted().toNumber(), 0.5);
    });

    it("can invert 0", () => {
      const f = new Fraction(0, 1);
      assert.equal(f.inverted().toNumber(), 0);
    });
  });

  describe("negated", () => {
    it("return the negated fraction", () => {
      const f = new Fraction(new BN(2).mul(tenPow18), tenPow18);
      assert.equal(f.negated().toNumber(), -2);
    });

    it("negates 0", () => {
      const f = new Fraction(0, 1);
      assert.equal(f.negated().toNumber(), 0);
    });
  });

  describe("mul", () => {
    it("can multiply large fractions", () => {
      const f1 = new Fraction(new BN(2).mul(tenPow18), tenPow18);
      const f2 = new Fraction(new BN(6).mul(tenPow18), tenPow18);

      assert.equal(f1.mul(f2).toNumber(), 12);
    });
  });

  describe("div", () => {
    it("can divide large fractions without remainder", () => {
      const f1 = new Fraction(new BN(6).mul(tenPow18), tenPow18);
      const f2 = new Fraction(new BN(2).mul(tenPow18), tenPow18);

      assert.equal(f1.div(f2).toNumber(), 3);
    });

    it("can divide large fractions with remainder", () => {
      const f1 = new Fraction(
        new BN(6).mul(tenPow18).add(new BN(10).pow(new BN(16))),
        tenPow18
      );
      const f2 = new Fraction(new BN(2).mul(tenPow18), tenPow18);

      assert.equal(f1.div(f2).toNumber(), 3.005);
    });
  });

  describe("sub", () => {
    it("computes the difference between 2 fractions with result close to 0", () => {
      const f1 = new Fraction(
        tenPow18.add(new BN(10).pow(new BN(10))),
        tenPow18
      );
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(f1.sub(f2).toNumber(), 0.00000001);
    });

    it("computes the difference between 2 fractions with large result", () => {
      const f1 = new Fraction(tenPow18, 1);
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(
        f1
          .sub(f2)
          .toBN()
          .toString(),
        tenPow18.sub(new BN(1)).toString()
      );
    });
  });

  describe("add", () => {
    it("computes the sum of two fractions", () => {
      const f1 = new Fraction(
        tenPow18.add(new BN(10).pow(new BN(10))),
        tenPow18
      );
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(f1.sub(f2).toNumber(), 0.00000001);
    });
  });
});
