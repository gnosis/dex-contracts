import { Fraction } from "../../src/fraction";
import BN from "bn.js";
import { assert } from "chai";
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

  describe("eq", () => {
    it("returns true when identical", () => {
      assert.isTrue(new Fraction(2, 3).eq(new Fraction(2, 3)));
      assert.isTrue(new Fraction(2, 2).eq(new Fraction(2, 2)));
      assert.isTrue(new Fraction(2, 1).eq(new Fraction(2, 1)));
    });

    it("returns true when reduced forms are equal", () => {
      assert.isTrue(new Fraction(2, 3).eq(new Fraction(4, 6)));
      assert.isTrue(new Fraction(2, 2).eq(new Fraction(3, 3)));
      assert.isTrue(new Fraction(0, 2).eq(new Fraction(0, 3)));
    });

    it("return false when unequal (as fractions)", () => {
      assert.isFalse(new Fraction(1, 2).eq(new Fraction(3, 4)));
    });
  });

  describe("inverted", () => {
    it("returns the reciprocal of the given fraction", () => {
      const f = new Fraction(new BN(2).mul(tenPow18), tenPow18);
      assert.equal(f.inverted().toNumber(), 0.5);
    });

    it("can invert 0", () => {
      const f = new Fraction(0, 1);
      assert.equal(f.inverted().toNumber(), Infinity);
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
        tenPow18,
      );
      const f2 = new Fraction(new BN(2).mul(tenPow18), tenPow18);

      assert.equal(f1.div(f2).toNumber(), 3.005);
    });
  });

  describe("sub", () => {
    it("computes the difference between 2 fractions with result close to 0", () => {
      const f1 = new Fraction(
        tenPow18.add(new BN(10).pow(new BN(10))),
        tenPow18,
      );
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(f1.sub(f2).toNumber(), 0.00000001);
    });

    it("computes the difference between 2 fractions with large result", () => {
      const f1 = new Fraction(tenPow18, 1);
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(
        f1.sub(f2).toBN().toString(),
        tenPow18.sub(new BN(1)).toString(),
      );
    });
  });

  describe("add", () => {
    it("computes the sum of two fractions", () => {
      const f1 = new Fraction(
        tenPow18.add(new BN(10).pow(new BN(10))),
        tenPow18,
      );
      const f2 = new Fraction(tenPow18, tenPow18);

      assert.equal(f1.sub(f2).toNumber(), 0.00000001);
    });
  });

  describe("toNumber", () => {
    it("Can serialize large coprime Fractions", () => {
      // Using two prime number ~10**18
      const f = new Fraction(
        new BN("1000000000000000003", 10),
        new BN("1000000000000000009", 10),
      );
      assert.equal(f.toNumber(), 1);
    });

    it("Can serialize large number", () => {
      const f = new Fraction(tenPow18, 1);
      assert.equal(f.toNumber(), 1e18);
    });

    it("Can serialize number larger than float", () => {
      const f = new Fraction(
        new BN(
          "4572703011319588167347432415546880036279866516943345249514864772813530139562604616171825435245554855143198721150328379973878658975213121347107927848905622759808528046680694931071812505099249835494785625055292121740875930346662225138972256888437500357739010418759122146937662234675889914922526355031952562363843368434796080505266339127627357626793894148384690286306732645932753887586933120444885403006477593485191718007262006965294247514114763095506587377085460750400000",
        ),
        new BN(
          "4774642967403412778558002718245820511160340393936581384568251929433121266847718907194950001102609642111137823519729464988698100962023057203306804424578581032780993445591560733837592299028888352218568642023539602725628897211541316901852536439083302862262101219849809407717422630910964615478205410140280934609846041106236330315316634515479595683742854529339310209222679458248292443955431255834882063370342436913436854307979328247288503275306278914502165428008437070219920998172584805926041217",
        ),
      );
      assert.equal(f.toNumber(), 9.57705747327607e-22);
      assert.equal(f.inverted().toNumber(), 1.0441620537314425e21);
    });
    it("Can serialize number huge number over 1", () => {
      const f = new Fraction(
        new BN(
          "4572703011319588167347432415546880036279866516943345249514864772813530139562604616171825435245554855143198721150328379973878658975213121347107927848905622759808528046680694931071812505099249835494785625055292121740875930346662225138972256888437500357739010418759122146937662234675889914922526355031952562363843368434796080505266339127627357626793894148384690286306732645932753887586933120444885403006477593485191718007262006965294247514114763095506587377085460750400000",
        ),
        1,
      );
      assert.equal(f.toNumber(), Infinity);
    });
  });

  describe("fromNumber", () => {
    it("converts numbers to Fraction", () => {
      const testCases = [
        {
          number: 0.5,
          expected: new Fraction(1, 2),
        },
        {
          number: 2,
          expected: new Fraction(2, 1),
        },
      ];
      for (const { number, expected } of testCases)
        assert(Fraction.fromNumber(number).sub(expected).isZero());
    });

    it("fails on bad input", () => {
      const testCases = [NaN, Infinity, -Infinity];
      let hasThrown = false;
      for (const number of testCases) {
        try {
          Fraction.fromNumber(number);
        } catch (error) {
          assert(error.message, "Invalid number");
          hasThrown = true;
        }
      }
      assert(hasThrown);
    });

    it("fails with subnormal numbers", () => {
      const testCases = [2 ** -1023, Number.MIN_VALUE];
      let hasThrown = false;
      for (const number of testCases) {
        try {
          Fraction.fromNumber(number);
        } catch (error) {
          assert(error.message, "Subnormal numbers are not supported");
          hasThrown = true;
        }
      }
      assert(hasThrown);
    });

    it("has toNumber as its right inverse", () => {
      const testCases = [
        1 / 3,
        1.0,
        1.1,
        1000000000000000000,
        0,
        -0,
        Number.MAX_VALUE,
        1 + Number.EPSILON,
        2 ** -1022,
      ];
      for (const number of testCases)
        assert.equal(Fraction.fromNumber(number).toNumber(), number);
    });
  });

  describe("clone", () => {
    it("creates a deep copy", () => {
      const original = new Fraction(1, 2);
      const serialized = JSON.stringify(original);

      const clone = original.clone();
      clone.mul(new Fraction(1, 2));
      assert.equal(JSON.stringify(original), serialized);
    });
  });

  describe("fromJSON", () => {
    it("works", () => {
      const original = new Fraction(10, 1);
      const serialized = JSON.stringify(original);
      const deserialized = Fraction.fromJSON(JSON.parse(serialized));
      assert.equal(JSON.stringify(original), JSON.stringify(deserialized));
    });
  });
});
