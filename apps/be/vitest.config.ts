import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
