import { generateKeyBetween } from "fractional-indexing";

export function keyAfter(prev: string | null): string {
  return generateKeyBetween(prev, null);
}

export function keyBefore(next: string): string {
  return generateKeyBetween(null, next);
}

export function keyBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}
