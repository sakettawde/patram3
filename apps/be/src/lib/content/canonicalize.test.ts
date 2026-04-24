import { describe, expect, it } from "vite-plus/test";
import { canonicalizeJson } from "./canonicalize";

describe("canonicalizeJson", () => {
  it("sorts object keys recursively", () => {
    const input = { b: 1, a: { z: true, y: [3, 2, 1] } };
    expect(canonicalizeJson(input)).toBe('{"a":{"y":[3,2,1],"z":true},"b":1}');
  });

  it("is stable across equivalent objects", () => {
    const a = { x: 1, y: { b: 2, a: 1 } };
    const b = { y: { a: 1, b: 2 }, x: 1 };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
  });

  it("preserves array order (order is semantically meaningful in PM)", () => {
    expect(canonicalizeJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined values inside objects", () => {
    const input = { a: 1, b: undefined };
    expect(canonicalizeJson(input as unknown as Record<string, unknown>)).toBe('{"a":1}');
  });

  it("handles null", () => {
    expect(canonicalizeJson({ a: null })).toBe('{"a":null}');
  });
});
