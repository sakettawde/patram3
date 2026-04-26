import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import { AuthGate } from "./auth-gate";

const lookupSpy = vi.fn(async (id: string) =>
  id === "good" ? { id: "good", name: "Saket", createdAt: 0, updatedAt: 0 } : null,
);

vi.mock("./use-current-user", async (original) => {
  const real = await original<typeof import("./use-current-user")>();
  return {
    ...real,
    useStoredUserId: () => [null, vi.fn()] as const,
    useCurrentUserQuery: () => ({ isPending: false, error: null, data: null }),
    useCreateUser: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
    useLookupUser: () => ({
      lookup: lookupSpy,
      pending: false,
      error: null,
    }),
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthGate>
        <div>app</div>
      </AuthGate>
    </QueryClientProvider>
  );
}

describe("NamePrompt code path", () => {
  test("toggles to code mode and calls lookup with the pasted value", async () => {
    render(wrap());
    fireEvent.click(await screen.findByText(/Already have a code/));
    await userEvent.type(screen.getByPlaceholderText("Your patram code"), "ghost");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() => expect(lookupSpy).toHaveBeenCalledWith("ghost"));
  });
});
