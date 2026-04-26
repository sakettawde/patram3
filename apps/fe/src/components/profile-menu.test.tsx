import { describe, expect, test, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileMenu } from "./profile-menu";

vi.mock("#/auth/auth-gate", () => ({
  useUser: () => ({ id: "user_demo123", name: "Saket", createdAt: 0, updatedAt: 0 }),
}));

describe("ProfileMenu", () => {
  test("renders the user's name and reveals the code on open", async () => {
    render(<ProfileMenu />);
    expect(screen.getByText("Saket")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Saket/ }));
    expect(await screen.findByText(/user_demo123/)).toBeTruthy();
  });

  test("Copy button writes the code to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole("button", { name: /Saket/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Copy code/ }));
    expect(writeText).toHaveBeenCalledWith("user_demo123");
  });
});
