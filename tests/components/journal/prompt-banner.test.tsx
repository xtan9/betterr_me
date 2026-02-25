import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptBanner } from "@/components/journal/prompt-banner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("PromptBanner", () => {
  it("renders prompt text for valid promptKey", () => {
    const onDismiss = vi.fn();
    render(<PromptBanner promptKey="gratitude-01" onDismiss={onDismiss} />);

    expect(
      screen.getByText("journal.prompts.gratitude01")
    ).toBeInTheDocument();
  });

  it("returns null for invalid/unknown promptKey", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <PromptBanner promptKey="nonexistent-key" onDismiss={onDismiss} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(<PromptBanner promptKey="gratitude-01" onDismiss={onDismiss} />);

    const dismissButton = screen.getByRole("button", {
      name: "common.cancel",
    });
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows Lightbulb icon", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <PromptBanner promptKey="gratitude-01" onDismiss={onDismiss} />
    );

    // Lightbulb renders as an SVG element
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders different prompts correctly", () => {
    const onDismiss = vi.fn();
    render(<PromptBanner promptKey="reflection-03" onDismiss={onDismiss} />);

    expect(
      screen.getByText("journal.prompts.reflection03")
    ).toBeInTheDocument();
  });

  it("has dismiss button with correct aria-label", () => {
    const onDismiss = vi.fn();
    render(<PromptBanner promptKey="goals-01" onDismiss={onDismiss} />);

    const dismissButton = screen.getByRole("button", {
      name: "common.cancel",
    });
    expect(dismissButton).toBeInTheDocument();
  });
});
