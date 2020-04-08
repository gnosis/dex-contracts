import BN from "bn.js";


export function numberToFraction(number: number) {
  // retrieve mantissa, exponent, and sign from bit representation of number
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, number);
  const bits = view.getBigUint64(0);
  const sign = (bits >> BigInt(63)) ? BigInt(-1) : BigInt(1);
  const exponent = ((bits >> BigInt(52)) & BigInt(0x7ff)) - BigInt(1023);
  const one = BigInt(1) << BigInt(52);
  const mantissa = bits & (one - BigInt(1));
  // number is 1.mantissa * 2**exponent

  switch (exponent) {
    case BigInt(1024): // infinities and NaN
      throw Error("Invalid number")
    case BigInt(-1023):
      if (mantissa == BigInt(0)) // positive and negative zero
        return [BigInt(0), sign]
      else // subnormal numbers
        throw Error("Subnormal numbers are not supported") 
  }

  const mantissa_plus_one = mantissa + one
  const shifted_exponent = exponent - BigInt(52)

  if (shifted_exponent >= BigInt(0))
    return  [
      sign * mantissa_plus_one * (BigInt(1) << shifted_exponent),
      BigInt(1)
    ]
  else
    return [
      sign * mantissa_plus_one,
      BigInt(1) << -shifted_exponent
    ]
}
