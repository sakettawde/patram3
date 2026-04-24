// Temporary stub. Task 27 replaces this with generateKeyBetween from fractional-indexing.
// When b is null (tail append) or a is null (head prepend), we currently return a sentinel
// that tells the BE to compute the next key itself. For midpoint cases, we can't compute
// a valid key yet — Task 27 fixes this.
export function keyBetween(a: string | null, b: string | null): string | null {
  if (a !== null && b !== null) {
    // Midpoint not yet supported — caller must handle null return by falling back to
    // sending the POST without an orderKey (BE will append to tail).
    return null;
  }
  // head prepend or tail append: return null so caller sends POST without orderKey
  return null;
}
