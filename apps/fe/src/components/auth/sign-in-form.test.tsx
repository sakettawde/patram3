import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vite-plus/test";
import { renderWithProviders } from "#/test/test-utils";
import { server } from "#/test/server";
import { SignInForm } from "./sign-in-form";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
}));

describe("SignInForm", () => {
  test("renders 'Wrong email or password' on 401", async () => {
    server.use(http.post("*/auth/sign-in/email", () => HttpResponse.json({}, { status: 401 })));
    renderWithProviders(<SignInForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2xx");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/wrong email or password/i);
  });
});
