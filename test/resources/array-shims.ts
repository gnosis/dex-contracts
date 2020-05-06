/**
 * A shim for the `flat()` method that creates a new array with all sub-array
 * elements concatenated into it recursively up to the specified depth
 * @param arr The array.
 * @param depth The depth level specifying how deep a nested array
 *                           struction should be flattened. Defaults to 1.
 * @return {[]} A new array with the sub-array elements concatenated to it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flat(arr: any[], depth = 1): any[] {
  // implementation taken from
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat#Alternative
  return depth > 0
    ? arr.reduce(
      (acc, val) =>
        acc.concat(Array.isArray(val) ? flat(val, depth - 1) : val),
      []
    )
    : arr.slice()
}

/**
 * Deduplicates an array's element. Note that order is not preserved.
 * @param arr The array.
 * @return A new array containing only unique elements.
 */
export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
