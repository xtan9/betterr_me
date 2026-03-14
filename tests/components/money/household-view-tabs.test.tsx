import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";

expect.extend(matchers);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HouseholdViewTabs", () => {
  const defaultProps = {
    value: "mine" as const,
    onValueChange: vi.fn(),
    isMultiMember: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isMultiMember is false", () => {
    const { container } = render(
      <HouseholdViewTabs
        value="mine"
        onValueChange={vi.fn()}
        isMultiMember={false}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders Mine and Household tabs when isMultiMember is true", () => {
    render(<HouseholdViewTabs {...defaultProps} isMultiMember={true} />);

    expect(screen.getByText("tabMine")).toBeInTheDocument();
    expect(screen.getByText("tabHousehold")).toBeInTheDocument();
  });

  it("calls onValueChange when tab is clicked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <HouseholdViewTabs
        value="mine"
        onValueChange={onValueChange}
        isMultiMember={true}
      />
    );

    await user.click(screen.getByText("tabHousehold"));
    expect(onValueChange).toHaveBeenCalledWith("household");
  });

  it("shows Mine tab as active by default", () => {
    render(
      <HouseholdViewTabs
        value="mine"
        onValueChange={vi.fn()}
        isMultiMember={true}
      />
    );

    const mineTab = screen.getByText("tabMine");
    expect(mineTab).toHaveAttribute("data-state", "active");

    const householdTab = screen.getByText("tabHousehold");
    expect(householdTab).toHaveAttribute("data-state", "inactive");
  });

  it("shows Household tab as active when value is household", () => {
    render(
      <HouseholdViewTabs
        value="household"
        onValueChange={vi.fn()}
        isMultiMember={true}
      />
    );

    const householdTab = screen.getByText("tabHousehold");
    expect(householdTab).toHaveAttribute("data-state", "active");

    const mineTab = screen.getByText("tabMine");
    expect(mineTab).toHaveAttribute("data-state", "inactive");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <HouseholdViewTabs {...defaultProps} isMultiMember={true} />
    );

    // Disable aria-valid-attr-value rule: Radix generates aria-controls
    // referencing tab panel IDs that don't render in jsdom (no content panels)
    expect(
      await axe(container, {
        rules: { "aria-valid-attr-value": { enabled: false } },
      })
    ).toHaveNoViolations();
  });
});
