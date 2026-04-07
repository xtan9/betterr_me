import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";

describe("ThinkingIndicator", () => {
  it("renders three animated dots", () => {
    render(<ThinkingIndicator />);
    const dots = screen.getAllByTestId("thinking-dot");
    expect(dots).toHaveLength(3);
  });

  it("has an accessible label", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("Thinking...")).toBeInTheDocument();
  });

  it("renders in an assistant-styled bubble", () => {
    const { container } = render(<ThinkingIndicator />);
    const bubble = container.firstElementChild;
    expect(bubble?.className).toContain("justify-start");
  });
});
