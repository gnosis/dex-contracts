import BN from "bn.js";

export class Fraction {
  private numerator: BN;
  private denominator: BN;

  constructor(numerator: BN | number, denominator: BN | number) {
    this.numerator = new BN(numerator);
    this.denominator = new BN(denominator);

    if (this.denominator.isZero()) {
      throw Error("Denominator cannot be zero");
    }
  }

  isZero() {
    return this.numerator.isZero();
  }

  gt(other: Fraction) {
    const diff = this.sub(other);
    return diff.numerator.mul(diff.denominator).gt(new BN(0));
  }

  lt(other: Fraction) {
    const diff = this.sub(other);
    return diff.numerator.mul(diff.denominator).lt(new BN(0));
  }

  reduce() {
    const greatest_common_denominator = this.numerator.gcd(this.denominator);
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
        .iadd(other.numerator.mul(this.denominator)),
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
