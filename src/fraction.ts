import BN from "bn.js";

export class Fraction {
  private numerator: BN;
  private denominator: BN;

  constructor(numerator: BN | number, denominator: BN | number) {
    if (typeof numerator == "number") {
      this.numerator = new BN(numerator);
    } else {
      this.numerator = numerator;
    }

    if (typeof denominator == "number") {
      this.denominator = new BN(denominator);
    } else {
      this.denominator = denominator;
    }

    if (this.denominator.isZero()) {
      throw Error("Denominator cannot be zero");
    }
  }

  reduce() {
    const greatest_common_denominator = gcd(this.numerator, this.denominator);
    this.numerator = this.numerator.div(greatest_common_denominator);
    this.denominator = this.denominator.div(greatest_common_denominator);
  }

  inverted() {
    return new Fraction(this.denominator, this.numerator);
  }

  negated() {
    return new Fraction(this.numerator.neg(), this.denominator);
  }

  mul(other: Fraction) {
    const result = new Fraction(
      this.numerator.mul(other.numerator),
      this.denominator.mul(other.denominator)
    );
    result.reduce();
    return result;
  }

  div(other: Fraction) {
    return this.mul(other.inverted());
  }

  sub(other: Fraction) {
    return this.add(other.negated());
  }

  add(other: Fraction) {
    const result = new Fraction(
      this.numerator
        .mul(other.denominator)
        .add(other.numerator.mul(this.denominator)),
      this.denominator.mul(other.denominator)
    );
    result.reduce();
    return result;
  }

  toNumber() {
    return this.numerator.toNumber() / this.denominator.toNumber();
  }

  toJSON() {
    return this.toNumber();
  }
}

// https://github.com/AllAlgorithms/typescript/blob/master/math/gcd/gcd.ts
function gcd(num1: BN, num2: BN): BN {
  if (num1.isZero() || num2.isZero()) {
    return new BN(0);
  }
  if (num1.eq(num2)) {
    return num1;
  }
  if (num1.gt(num2)) {
    return gcd(num1.sub(num2), num2);
  }
  return gcd(num1, num2.sub(num1));
}
