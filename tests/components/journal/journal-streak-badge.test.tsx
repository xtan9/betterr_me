import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalStreakBadge } from "@/components/journal/journal-streak-badge";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "count" && params?.count !== undefined) {
      return `${params.count} day streak`;
    }
    return key;
  },
}));

describe("JournalStreakBadge", () => {
  it("renders nothing when streak is 0", () => {
    const { container } = render(<JournalStreakBadge streak={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows flame icon and count when streak > 0", () => {
    render(<JournalStreakBadge streak={3} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3 day streak");
  });

  it("applies milestone styling when streak is 7", () => {
    render(<JournalStreakBadge streak={7} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge.className).toContain("text-orange-500");
    expect(badge.className).toContain("font-semibold");
  });

  it("applies milestone styling when streak is 30", () => {
    render(<JournalStreakBadge streak={30} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge.className).toContain("text-orange-500");
  });

  it("applies milestone styling when streak is 365", () => {
    render(<JournalStreakBadge streak={365} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge.className).toContain("text-orange-500");
  });

  it("does not apply milestone styling for non-milestone numbers", () => {
    render(<JournalStreakBadge streak={5} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge.className).toContain("text-muted-foreground");
    expect(badge.className).not.toContain("text-orange-500");
  });

  it("does not apply milestone styling for streak of 10", () => {
    render(<JournalStreakBadge streak={10} />);
    const badge = screen.getByTestId("journal-streak-badge");
    expect(badge.className).not.toContain("text-orange-500");
  });
});
