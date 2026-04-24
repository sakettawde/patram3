import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { server } from "#/test/server";
import { SectionBlock } from "./section-block";
import { putLocalSnapshot } from "#/lib/section-save-store";
import type { Section } from "#/lib/api-types";

const section: Section = {
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "server" }] }],
  },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function renderBlock() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SectionBlock
        section={section}
        documentId="d1"
        isOnlySection={false}
        onRequestAddBelow={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("SectionBlock", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  test("mounts without crashing", () => {
    renderBlock();
  });

  test("seeds editor from fresher local snapshot and flushes to server", async () => {
    let patchBody: unknown = null;
    server.use(
      http.patch("*/sections/:id", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...section, version: 2 });
      }),
    );
    putLocalSnapshot("s1", {
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
      },
      savedAt: Date.UTC(2026, 0, 2),
    });
    const { container } = renderBlock();
    await waitFor(() => expect(container.textContent).toContain("local"));
    await waitFor(() =>
      expect(patchBody).toEqual({
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "local" }] }],
        },
      }),
    );
  });

  test("discards stale local snapshot", async () => {
    putLocalSnapshot("s1", {
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "stale" }] }],
      },
      savedAt: Date.UTC(2025, 11, 31),
    });
    const { container } = renderBlock();
    await waitFor(() => expect(container.textContent).toContain("server"));
    expect(window.localStorage.getItem("patram:section:s1")).toBeNull();
  });
});
