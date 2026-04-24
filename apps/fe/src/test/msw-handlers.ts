import { http, HttpResponse } from "msw";

export const defaultHandlers = [
  http.get("*/me", () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })),
];
