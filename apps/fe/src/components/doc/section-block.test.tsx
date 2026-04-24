import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, test } from "vite-plus/test";
import { SectionBlock } from "./section-block";
import type { Section } from "#/lib/api-types";

const section: Section = {
  id: "s1",
  documentId: "d1",
  orderKey: "a0",
  label: null,
  kind: "prose",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
  },
  contentText: "",
  contentHash: "",
  frontmatter: {},
  version: 1,
  createdBy: "u",
  updatedBy: "u",
  createdAt: "x",
  updatedAt: "x",
};

describe("SectionBlock", () => {
  test("mounts without crashing", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <SectionBlock
          section={section}
          documentId="d1"
          isOnlySection={false}
          onRequestAddBelow={() => {}}
        />
      </QueryClientProvider>,
    );
  });
});
