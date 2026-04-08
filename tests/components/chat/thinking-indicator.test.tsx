import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ThinkingIndicator", () => {
  it("renders three animated dots", () => {
    render(<ThinkingIndicator />);
    const dots = screen.getAllByTestId("thinking-dot");
    expect(dots).toHaveLength(3);
  });

  it("has an accessible label", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("thinking")).toBeInTheDocument();
  });

  it("renders in an assistant-styled bubble", () => {
    const { container } = render(<ThinkingIndicator />);
    const bubble = container.firstElementChild;
    expect(bubble?.className).toContain("justify-start");
  });
});
