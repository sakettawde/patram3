import { hc } from "hono/client";
import type { AppType } from "../../../be/src/index";

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const api = hc<AppType>(baseUrl, {
  init: { credentials: "include" },
});

export type Api = typeof api;
