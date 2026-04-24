export class ApiError<B = unknown> extends Error {
  constructor(
    public status: number,
    public body: B | null,
  ) {
    super(`ApiError(${status})`);
  }

  is409VersionConflict(): boolean {
    return (
      this.status === 409 &&
      typeof this.body === "object" &&
      this.body !== null &&
      (this.body as { error?: string }).error === "version_conflict"
    );
  }
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  throw new ApiError(res.status, body);
}
