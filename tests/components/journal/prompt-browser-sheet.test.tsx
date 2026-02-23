import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptBrowserSheet } from "@/components/journal/prompt-browser-sheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("PromptBrowserSheet", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    selectedKey: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sheet title when open", () => {
    render(<PromptBrowserSheet {...defaultProps} />);

    expect(screen.getByText("journal.prompts.title")).toBeInTheDocument();
  });

  it("renders 3 category tabs", () => {
    render(<PromptBrowserSheet {...defaultProps} />);

    expect(
      screen.getByText("journal.prompts.categories.gratitude")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.categories.reflection")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.categories.goals")
    ).toBeInTheDocument();
  });

  it("renders 5 prompts for default category (gratitude)", () => {
    render(<PromptBrowserSheet {...defaultProps} />);

    expect(
      screen.getByText("journal.prompts.gratitude01")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.gratitude02")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.gratitude03")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.gratitude04")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.gratitude05")
    ).toBeInTheDocument();
  });

  it("calls onSelect with correct key when prompt clicked", () => {
    const onSelect = vi.fn();
    render(<PromptBrowserSheet {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("journal.prompts.gratitude01"));

    expect(onSelect).toHaveBeenCalledWith("gratitude-01");
  });

  it("does not render content when closed", () => {
    render(<PromptBrowserSheet {...defaultProps} open={false} />);

    expect(
      screen.queryByText("journal.prompts.title")
    ).not.toBeInTheDocument();
  });

  it("shows selected indicator for selectedKey", () => {
    render(
      <PromptBrowserSheet {...defaultProps} selectedKey="gratitude-02" />
    );

    // The selected prompt button should have the accent styling
    const selectedButton = screen.getByText("journal.prompts.gratitude02")
      .closest("button");
    expect(selectedButton?.className).toContain("bg-accent/50");
    expect(selectedButton?.className).toContain("border-primary/20");
  });

  it("non-selected prompt does not have selected styling", () => {
    render(
      <PromptBrowserSheet {...defaultProps} selectedKey="gratitude-02" />
    );

    const nonSelectedButton = screen.getByText("journal.prompts.gratitude01")
      .closest("button");
    expect(nonSelectedButton?.className).not.toContain("bg-accent/50");
  });

  it("renders prompts for reflection category when tab clicked", async () => {
    const user = userEvent.setup();
    render(<PromptBrowserSheet {...defaultProps} />);

    const reflectionTab = screen.getByRole("tab", {
      name: "journal.prompts.categories.reflection",
    });
    await user.click(reflectionTab);

    expect(
      screen.getByText("journal.prompts.reflection01")
    ).toBeInTheDocument();
    expect(
      screen.getByText("journal.prompts.reflection05")
    ).toBeInTheDocument();
  });

  it("renders prompts for goals category when tab clicked", async () => {
    const user = userEvent.setup();
    render(<PromptBrowserSheet {...defaultProps} />);

    const goalsTab = screen.getByRole("tab", {
      name: "journal.prompts.categories.goals",
    });
    await user.click(goalsTab);

    expect(
      screen.getByText("journal.prompts.goals01")
    ).toBeInTheDocument();
    expect(screen.getByText("journal.prompts.goals05")).toBeInTheDocument();
  });
});
