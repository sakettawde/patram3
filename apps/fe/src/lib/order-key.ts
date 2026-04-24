import { generateKeyBetween } from "fractional-indexing";

export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}
