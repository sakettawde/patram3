import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const isTest = process.env.VITEST === "true";

const BE_URL = process.env.VITE_BE_URL ?? "http://localhost:8787";
const BE_PATHS = [
  "/me",
  "/documents",
  "/sections",
  "/threads",
  "/comments",
  "/auth",
  "/dev",
  "/health",
];

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    ...(isTest ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
  server: {
    proxy: Object.fromEntries(
      BE_PATHS.map((p) => [p, { target: BE_URL, changeOrigin: true, secure: false }]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});

export default config;
