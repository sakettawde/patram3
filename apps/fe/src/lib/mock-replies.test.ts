import { describe, expect, test } from "vite-plus/test";
import { MOCK_REPLIES, pickReply } from "./mock-replies";

describe("mock-replies", () => {
  test("MOCK_REPLIES has at least 4 entries", () => {
    expect(MOCK_REPLIES.length).toBeGreaterThanOrEqual(4);
  });

  test("pickReply cycles through the pool by message count", () => {
    const r0 = pickReply(0);
    const rPool = pickReply(MOCK_REPLIES.length);
    expect(r0).toBe(rPool); // wraps around
  });

  test("pickReply returns a non-empty string", () => {
    expect(pickReply(0).length).toBeGreaterThan(0);
    expect(pickReply(7).length).toBeGreaterThan(0);
  });

  test("pickReply handles negative or out-of-range counts gracefully", () => {
    expect(typeof pickReply(-3)).toBe("string");
    expect(typeof pickReply(9999)).toBe("string");
  });
});
