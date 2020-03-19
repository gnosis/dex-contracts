export class Fraction {
  private numerator: number;
  private denominator: number;

  constructor(numerator: number, denominator: number) {
    this.numerator = numerator;
    if (denominator == 0) {
      throw Error("Denominator cannot be zero");
    }
    this.denominator = denominator;
  }

  reduce() {
    const greatest_common_denominator = gcd(this.numerator, this.denominator);
    this.numerator /= greatest_common_denominator;
    this.denominator /= greatest_common_denominator;
  }

  inverted() {
    return new Fraction(this.denominator, this.numerator);
  }

  negated() {
    return new Fraction(this.numerator * -1, this.denominator);
  }

  mul(other: Fraction) {
    const result = new Fraction(
      this.numerator * other.numerator,
      this.denominator * other.denominator
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
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator
    );
    result.reduce();
    return result;
  }

  toNumber() {
    return this.numerator / this.denominator;
  }

  toJSON() {
    return this.toNumber();
  }
}

// https://github.com/AllAlgorithms/typescript/blob/master/math/gcd/gcd.ts
function gcd(num1: number, num2: number): number {
  if (num1 === 0 || num2 === 0) {
    return 0;
  }
  if (num1 === num2) {
    return num1;
  }
  if (num1 > num2) {
    return gcd(num1 - num2, num2);
  }
  return gcd(num1, num2 - num1);
}
