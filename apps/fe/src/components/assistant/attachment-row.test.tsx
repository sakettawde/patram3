import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentRow } from "./attachment-row";
import type { DraftAttachment } from "./attachment-chip";

vi.mock("#/lib/assistant-api", () => ({
  uploadFile: vi.fn(),
}));

function Harness() {
  const [a, setA] = useState<DraftAttachment[]>([]);
  return (
    <div>
      <AttachmentRow attachments={a} setAttachments={setA} userId="test-user" />
      <div data-testid="count">{a.length}</div>
      <div data-testid="status">{a.map((x) => x.status).join(",")}</div>
    </div>
  );
}

describe("AttachmentRow", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  test("uploads an image and marks chip ready", async () => {
    const api = await import("#/lib/assistant-api");
    (api.uploadFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      fileId: "f1",
      kind: "image",
      name: "x.png",
      size: 4,
    });
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });

  test("marks chip error on upload failure and shows retry button", async () => {
    const api = await import("#/lib/assistant-api");
    (api.uploadFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(screen.getByRole("button", { name: /retry upload/i })).toBeTruthy();
  });

  test("text file is read inline and marked ready", async () => {
    render(<Harness />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["hello"], "n.txt", { type: "text/plain" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });
});
