import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { NextMilestone } from "@/components/habits/next-milestone";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key;
      for (const [k, v] of Object.entries(params)) {
        result += ` ${k}=${v}`;
      }
      return result;
    }
    return key;
  },
}));

describe("NextMilestone", () => {
  it("shows days remaining to next milestone for streak of 5", () => {
    render(<NextMilestone currentStreak={5} />);
    expect(screen.getByText(/nextMilestone.*days=2.*milestone=7/)).toBeInTheDocument();
  });

  it("shows days remaining for streak of 10", () => {
    render(<NextMilestone currentStreak={10} />);
    expect(screen.getByText(/nextMilestone.*days=4.*milestone=14/)).toBeInTheDocument();
  });

  it("shows no next milestone when beyond 365", () => {
    render(<NextMilestone currentStreak={400} />);
    expect(screen.getByText("noNextMilestone")).toBeInTheDocument();
  });

  it("shows no next milestone when at exactly 365", () => {
    render(<NextMilestone currentStreak={365} />);
    expect(screen.getByText("noNextMilestone")).toBeInTheDocument();
  });

  it("shows correct progress for streak of 0", () => {
    render(<NextMilestone currentStreak={0} />);
    expect(screen.getByText(/nextMilestone.*days=7.*milestone=7/)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<NextMilestone currentStreak={5} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
