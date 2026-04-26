import { expect, test, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewBar } from "./review-bar";

// localStorage shim: the test environment does not expose a global localStorage.
// Using a simple in-memory map that mimics the localStorage API.
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage,
    writable: true,
  });
}

test("renders count + buttons when there are proposals", () => {
  render(<ReviewBar count={3} onAcceptAll={() => {}} onRejectAll={() => {}} />);
  expect(screen.getByText(/3 changes/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /accept all/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /reject all/i })).toBeTruthy();
});

test("returns null when count is 0", () => {
  const { container } = render(
    <ReviewBar count={0} onAcceptAll={() => {}} onRejectAll={() => {}} />,
  );
  expect(container.firstChild).toBeNull();
});

test("invokes callbacks on click", () => {
  const onA = vi.fn();
  const onR = vi.fn();
  render(<ReviewBar count={2} onAcceptAll={onA} onRejectAll={onR} />);
  fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
  fireEvent.click(screen.getByRole("button", { name: /reject all/i }));
  expect(onA).toHaveBeenCalledOnce();
  expect(onR).toHaveBeenCalledOnce();
});
