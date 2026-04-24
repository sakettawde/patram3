import { describe, expect, it } from "vite-plus/test";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("produces the known sha256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces 64 hex chars", async () => {
    expect((await sha256Hex("patram")).length).toBe(64);
  });
});
