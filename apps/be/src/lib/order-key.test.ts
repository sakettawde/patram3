import { describe, expect, it } from "vite-plus/test";
import { keyAfter, keyBefore, keyBetween } from "./order-key";

describe("order-key", () => {
  it("keyAfter produces a key greater than input", () => {
    const k = keyAfter(null);
    const k2 = keyAfter(k);
    expect(k2 > k).toBe(true);
  });

  it("keyBefore produces a key less than input", () => {
    const k = keyAfter(null);
    const k2 = keyBefore(k);
    expect(k2 < k).toBe(true);
  });

  it("keyBetween produces a key strictly between its bounds", () => {
    const a = keyAfter(null);
    const b = keyAfter(a);
    const mid = keyBetween(a, b);
    expect(mid > a && mid < b).toBe(true);
  });
});
