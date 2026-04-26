const BASE_URL = import.meta.env.VITE_BE_URL ?? "";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

type Init = { headers?: Record<string, string> };

async function request<T>(method: string, path: string, body?: unknown, init?: Init): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers,
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const parsed = text ? safeParse(text) : undefined;

  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, init?: Init) => request<T>("GET", path, undefined, init),
  post: <T>(path: string, body: unknown, init?: Init) => request<T>("POST", path, body, init),
  patch: <T>(path: string, body: unknown, init?: Init) => request<T>("PATCH", path, body, init),
  del: <T>(path: string, init?: Init) => request<T>("DELETE", path, undefined, init),
};
