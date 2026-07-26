import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ControlPlaneForbidden from "@/app/control-plane/forbidden";

describe("ControlPlaneForbidden", () => {
  it("shows a controlled, non-enumerating denial state", () => {
    render(<ControlPlaneForbidden />);

    expect(screen.getByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByText(/membership|control plane/i)).not.toBeInTheDocument();
  });
});
