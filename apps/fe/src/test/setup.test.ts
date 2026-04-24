import { describe, expect, test } from "vitest";
import { server } from "./server";

describe("msw", () => {
  test("server is listening", () => {
    expect(server.listHandlers().length).toBeGreaterThan(0);
  });
});
