import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CategoryBadge } from "@/components/money/category-badge";
import type { Category } from "@/lib/db/types";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    household_id: "hh-1",
    name: "groceries",
    icon: null,
    is_system: true,
    color: null,
    display_name: null,
    created_at: "2026-02-22T00:00:00Z",
    ...overrides,
  };
}

describe("CategoryBadge", () => {
  it("renders category icon and display_name", () => {
    const cat = makeCategory({
      icon: "\uD83C\uDF55",
      display_name: "Food & Dining",
    });

    render(<CategoryBadge category={cat} />);

    expect(screen.getByText("\uD83C\uDF55")).toBeInTheDocument();
    expect(screen.getByText("Food & Dining")).toBeInTheDocument();
  });

  it("renders category name when display_name is null", () => {
    const cat = makeCategory({
      name: "groceries",
      display_name: null,
    });

    render(<CategoryBadge category={cat} />);

    expect(screen.getByText("groceries")).toBeInTheDocument();
  });

  it("renders 'Uncategorized' when category is null", () => {
    render(<CategoryBadge category={null} />);

    expect(
      screen.getByText("transactions.uncategorized")
    ).toBeInTheDocument();
  });

  it("shows color dot with correct color", () => {
    const cat = makeCategory({
      color: "#ff6b2b",
      display_name: "Shopping",
    });

    const { container } = render(<CategoryBadge category={cat} />);

    // Find the color dot span with the inline style
    const colorDot = container.querySelector(
      'span[style*="background-color"]'
    );
    expect(colorDot).not.toBeNull();
    expect(colorDot).toHaveStyle({ backgroundColor: "#ff6b2b" });
  });

  it("has no accessibility violations", async () => {
    const cat = makeCategory({
      icon: "\uD83D\uDED2",
      display_name: "Shopping",
      color: "#4ade80",
    });

    const { container } = render(<CategoryBadge category={cat} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
