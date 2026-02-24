import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JournalLinkChips } from "@/components/journal/journal-link-chips";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockLinks = [
  { id: "link-1", link_type: "habit" as const, link_id: "h-1", name: "Morning Run" },
  { id: "link-2", link_type: "task" as const, link_id: "t-1", name: "Buy groceries" },
  { id: "link-3", link_type: "project" as const, link_id: "p-1", name: "Website Redesign" },
];

describe("JournalLinkChips", () => {
  it("renders habit chips with teal styling", () => {
    render(<JournalLinkChips links={[mockLinks[0]]} />);
    const chip = screen.getByTestId("link-chip-habit");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("Morning Run");
    expect(chip.className).toContain("bg-teal-100");
  });

  it("renders task chips with blue styling", () => {
    render(<JournalLinkChips links={[mockLinks[1]]} />);
    const chip = screen.getByTestId("link-chip-task");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("Buy groceries");
    expect(chip.className).toContain("bg-blue-100");
  });

  it("renders project chips with purple styling", () => {
    render(<JournalLinkChips links={[mockLinks[2]]} />);
    const chip = screen.getByTestId("link-chip-project");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("Website Redesign");
    expect(chip.className).toContain("bg-purple-100");
  });

  it("shows remove button when onRemove provided", () => {
    const onRemove = vi.fn();
    render(<JournalLinkChips links={[mockLinks[0]]} onRemove={onRemove} />);
    expect(screen.getByTestId("remove-link-link-1")).toBeInTheDocument();
  });

  it("hides remove button when onRemove not provided", () => {
    render(<JournalLinkChips links={[mockLinks[0]]} />);
    expect(screen.queryByTestId("remove-link-link-1")).not.toBeInTheDocument();
  });

  it("calls onRemove with correct linkId on X click", () => {
    const onRemove = vi.fn();
    render(<JournalLinkChips links={[mockLinks[0]]} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId("remove-link-link-1"));
    expect(onRemove).toHaveBeenCalledWith("link-1");
  });

  it("renders empty when no links", () => {
    const { container } = render(<JournalLinkChips links={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders multiple chip types together", () => {
    render(<JournalLinkChips links={mockLinks} />);
    expect(screen.getByTestId("journal-link-chips")).toBeInTheDocument();
    expect(screen.getByTestId("link-chip-habit")).toBeInTheDocument();
    expect(screen.getByTestId("link-chip-task")).toBeInTheDocument();
    expect(screen.getByTestId("link-chip-project")).toBeInTheDocument();
  });
});
