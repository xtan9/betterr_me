import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  JournalMoodSelector,
  MOODS,
} from "@/components/journal/journal-mood-selector";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("JournalMoodSelector", () => {
  it("renders 5 emoji buttons", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    expect(buttons).toHaveLength(5);
  });

  it("has radiogroup role with proper aria-label", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAttribute("aria-label", "label");
  });

  it("each button has radio role and aria-checked state", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    buttons.forEach((button) => {
      expect(button).toHaveAttribute("aria-checked", "false");
    });
  });

  it("clicking a mood calls onChange with the value", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    fireEvent.click(buttons[0]); // Click first mood (value=5, amazing)
    expect(onChange).toHaveBeenCalledWith(MOODS[0].value);
  });

  it("selected mood has aria-checked true", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={5} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    expect(buttons[0]).toHaveAttribute("aria-checked", "true");
    expect(buttons[1]).toHaveAttribute("aria-checked", "false");
  });

  it("clicking the already-selected mood deselects (onChange called with null)", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={5} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    fireEvent.click(buttons[0]); // Click already selected
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders with no initial selection (value=null)", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    buttons.forEach((button) => {
      expect(button).toHaveAttribute("aria-checked", "false");
    });
  });

  it("all 5 aria-labels are present", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    MOODS.forEach((mood) => {
      expect(screen.getByLabelText(mood.label)).toBeInTheDocument();
    });
  });

  it("displays correct emoji for each mood", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    MOODS.forEach((mood, i) => {
      expect(buttons[i]).toHaveTextContent(mood.emoji);
    });
  });

  it("clicking different moods calls onChange with correct values", () => {
    const onChange = vi.fn();
    render(<JournalMoodSelector value={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");

    // Click "good" mood (index 1, value 4)
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(4);

    // Click "awful" mood (index 4, value 1)
    fireEvent.click(buttons[4]);
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
