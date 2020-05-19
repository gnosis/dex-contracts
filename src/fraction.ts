import BN from "bn.js";

const MAX_FLOAT_WIDTH = 1024;
const MAX_FLOAT_PRECISION = 52;

export class Fraction {
  private numerator: BN;
  private denominator: BN;

  constructor(numerator: BN | number, denominator: BN | number) {
    this.numerator = new BN(numerator);
    this.denominator = new BN(denominator);

    this.reduce();
  }

  isZero(): boolean {
    return this.numerator.isZero();
  }

  eq(other: Fraction): boolean {
    const diff = this.sub(other);
    return diff.isZero();
  }

  gt(other: Fraction): boolean {
    const diff = this.sub(other);
    return diff.numerator.mul(diff.denominator).gt(new BN(0));
  }

  lt(other: Fraction): boolean {
    const diff = this.sub(other);
    return diff.numerator.mul(diff.denominator).lt(new BN(0));
  }

  reduce(): void {
    const greatest_common_divisor = this.numerator.gcd(this.denominator);
    this.numerator = this.numerator.div(greatest_common_divisor);
    this.denominator = this.denominator.div(greatest_common_divisor);
  }

  inverted(): Fraction {
    return new Fraction(this.denominator, this.numerator);
  }

  negated(): Fraction {
    return new Fraction(this.numerator.neg(), this.denominator);
  }

  mul(other: Fraction): Fraction {
    return new Fraction(
      this.numerator.mul(other.numerator),
      this.denominator.mul(other.denominator),
    );
  }

  abs(): Fraction {
    return new Fraction(this.numerator.abs(), this.denominator.abs());
  }

  div(other: Fraction): Fraction {
    return this.mul(other.inverted());
  }

  sub(other: Fraction): Fraction {
    return this.add(other.negated());
  }

  add(other: Fraction): Fraction {
    return new Fraction(
      this.numerator
        .mul(other.denominator)
        .iadd(other.numerator.mul(this.denominator)),
      this.denominator.mul(other.denominator),
    );
  }

  toNumber(): number {
    let numerator = this.numerator.clone();
    let denominator = this.denominator.clone();

    // If ratio between numerator and denominator is larger than the maximum
    // float number precision, use integer division
    if (
      !denominator.isZero() &&
      numerator.div(denominator).bitLength() > MAX_FLOAT_PRECISION
    ) {
      numerator = numerator.div(denominator);
      denominator = new BN(1);
    } else if (
      !numerator.isZero() &&
      denominator.div(numerator).bitLength() > MAX_FLOAT_PRECISION
    ) {
      denominator = denominator.div(numerator);
      numerator = new BN(1);
    }

    // Prevent overflow by only keeping the most 1023 significant bits.
    // Since 2**1023 < Number.MAX_VALUE < 2**1024 this is safe.
    if (
      Math.max(
        parseInt(numerator.toString()),
        parseInt(denominator.toString()),
      ) === Infinity
    ) {
      const longestWidth = Math.max(
        numerator.bitLength(),
        denominator.bitLength(),
      );
      numerator = numerator.ishrn(longestWidth - MAX_FLOAT_WIDTH + 1);
      denominator = denominator.ishrn(longestWidth - MAX_FLOAT_WIDTH + 1);
    }
    return parseInt(numerator.toString()) / parseInt(denominator.toString());
  }

  /**
   * Represents a Javascript number as a pair numerator/denominator without precision loss
   * by retrieving mantissa, exponent, and sign from its bit representation
   * @param number The Javascript number to be represented
   * @return a BigInt array with two elements: numerator and denominator
   */
  private static numberToNumAndDen(number: number): [bigint, bigint] {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, number);
    const bits = view.getBigUint64(0);
    const sign = bits >> BigInt(63) ? BigInt(-1) : BigInt(1);
    const exponent = ((bits >> BigInt(52)) & BigInt(0x7ff)) - BigInt(1023);
    const one = BigInt(1) << BigInt(52);
    const mantissa = bits & (one - BigInt(1));
    // number is 1.mantissa * 2**exponent

    switch (exponent) {
      case BigInt(1024): // infinities and NaN
        throw Error("Invalid number");
      case BigInt(-1023):
        if (mantissa == BigInt(0))
          // positive and negative zero
          return [BigInt(0), sign];
        // subnormal numbers
        else throw Error("Subnormal numbers are not supported");
    }

    const mantissa_plus_one = mantissa + one;
    const shifted_exponent = exponent - BigInt(52);

    if (shifted_exponent >= BigInt(0))
      return [
        sign * mantissa_plus_one * (BigInt(1) << shifted_exponent),
        BigInt(1),
      ];
    else return [sign * mantissa_plus_one, BigInt(1) << -shifted_exponent];
  }

  static fromNumber(number: number): Fraction {
    const [numerator, denominator] = Fraction.numberToNumAndDen(number);
    return new Fraction(
      new BN(numerator.toString()),
      new BN(denominator.toString()),
    );
  }

  toBN(): BN {
    return this.numerator.div(this.denominator);
  }

  clone(): Fraction {
    return new Fraction(this.numerator.clone(), this.denominator.clone());
  }

  static fromJSON(o: FractionJson): Fraction {
    const numerator = new BN(o.numerator, "hex");
    const denominator = new BN(o.denominator, "hex");
    return new Fraction(numerator, denominator);
  }
}

export interface FractionJson {
  numerator: string;
  denominator: string;
}
