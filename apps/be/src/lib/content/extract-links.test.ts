import { describe, expect, it } from "vite-plus/test";
import { extractLinks } from "./extract-links";

describe("extractLinks", () => {
  it("returns empty for doc with no docLink marks", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
      }),
    ).toEqual([]);
  });

  it("extracts one docLink mark", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "see",
                marks: [{ type: "docLink", attrs: { docId: "d1", sectionId: "s1" } }],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ targetDocumentId: "d1", targetSectionId: "s1" }]);
  });

  it("dedupes identical tuples", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "a", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
              { type: "text", text: "b", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
            ],
          },
        ],
      }),
    ).toEqual([{ targetDocumentId: "d1", targetSectionId: null }]);
  });

  it("keeps tuples with and without sectionId as distinct", () => {
    const out = extractLinks({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "docLink", attrs: { docId: "d1" } }] },
            {
              type: "text",
              text: "b",
              marks: [{ type: "docLink", attrs: { docId: "d1", sectionId: "s1" } }],
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ targetDocumentId: "d1", targetSectionId: null });
    expect(out).toContainEqual({ targetDocumentId: "d1", targetSectionId: "s1" });
  });

  it("ignores docLink marks with no docId", () => {
    expect(
      extractLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "a", marks: [{ type: "docLink", attrs: {} }] }],
          },
        ],
      }),
    ).toEqual([]);
  });
});
