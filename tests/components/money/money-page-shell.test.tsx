import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { MoneyPageShell } from "@/components/money/money-page-shell";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MoneyPageShell", () => {
  it("renders the empty state heading", () => {
    render(<MoneyPageShell />);

    expect(screen.getByText("emptyState.heading")).toBeInTheDocument();
  });

  it("renders the empty state description", () => {
    render(<MoneyPageShell />);

    expect(screen.getByText("emptyState.description")).toBeInTheDocument();
  });

  it("renders the coming soon text", () => {
    render(<MoneyPageShell />);

    expect(screen.getByText("emptyState.comingSoon")).toBeInTheDocument();
    expect(
      screen.getByText("emptyState.comingSoonDescription")
    ).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<MoneyPageShell />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
