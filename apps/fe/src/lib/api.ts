import { hc } from "hono/client";
import type { AppType } from "../../../be/src/index";

const envBaseUrl = import.meta.env.VITE_API_URL as string | undefined;
const browserOrigin = typeof window !== "undefined" ? window.location.origin : undefined;

// Explicit VITE_API_URL wins (prod or cross-origin dev). Otherwise use the current
// page's origin so the Vite dev proxy forwards /me, /documents, /auth, etc. to the BE.
// Fall back to a dev-localhost origin for SSR/test contexts where `window` is absent.
const baseUrl = envBaseUrl ?? browserOrigin ?? "http://localhost:3000";

export const api = hc<AppType>(baseUrl, {
  init: { credentials: "include" },
});

export type Api = typeof api;
