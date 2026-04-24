import { describe, expect, test } from "vite-plus/test";
import { keyBetween } from "./order-key";

describe("keyBetween", () => {
  test("strictly between a and b", () => {
    const k = keyBetween("a0", "a1");
    expect(k > "a0" && k < "a1").toBe(true);
  });
  test("after tail when b is null", () => {
    const k = keyBetween("a0", null);
    expect(k > "a0").toBe(true);
  });
  test("before head when a is null", () => {
    const k = keyBetween(null, "a0");
    expect(k < "a0").toBe(true);
  });
});
