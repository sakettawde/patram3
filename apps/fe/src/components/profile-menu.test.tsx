import { describe, expect, test, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import { USER_ID_STORAGE_KEY } from "#/auth/types";
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

  test("Log out reveals the confirm view with the code still visible", async () => {
    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole("button", { name: /Saket/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Log out$/ }));
    expect(await screen.findByText(/Log out of this device\?/)).toBeTruthy();
    expect(screen.getByText(/user_demo123/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm log out/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeTruthy();
  });

  test("Confirm log out clears the stored userId and reloads", async () => {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, "user_demo123");
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole("button", { name: /Saket/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Log out$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm log out/ }));

    expect(removeSpy).toHaveBeenCalledWith(USER_ID_STORAGE_KEY);
    expect(reload).toHaveBeenCalled();

    removeSpy.mockRestore();
  });
});
