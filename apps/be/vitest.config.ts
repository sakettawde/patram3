import { defineConfig } from "vite-plus";

// BE tests run in plain Node. The original Task 1 plan tried to use
// @cloudflare/vitest-pool-workers for D1-backed integration tests, but that
// pool peer-deps vitest@^4.1.0 while the project's vite-plus toolchain
// aliases the `vitest` name to @voidzero-dev/vite-plus-test (per CLAUDE.md).
// The pool's worker bundle then can't resolve `vitest/worker` at runtime.
// We use plain vitest here; D1-backed route tests are deferred and covered
// by manual verification.
export default defineConfig({
  test: {
    environment: "node",
  },
});
