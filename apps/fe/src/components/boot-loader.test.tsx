import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vite-plus/test";
import { BootLoader } from "./boot-loader";

describe("<BootLoader />", () => {
  test("renders a status region with the patram wordmark", () => {
    render(<BootLoader />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("patram");
  });
});
