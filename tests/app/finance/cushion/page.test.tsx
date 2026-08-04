import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));
vi.mock("@/lib/finance/household-runway-service", () => ({
  createHouseholdRunwayService: vi.fn(() => ({
    load: mocks.load,
  })),
}));
vi.mock("@/components/finance/household-runway", () => ({
  HouseholdRunway: ({
    isAuthenticated,
    hasSavedPlan,
    initialAdjustments,
  }: {
    isAuthenticated: boolean;
    hasSavedPlan: boolean;
    initialAdjustments: unknown;
  }) => (
    <div
      data-testid="household-runway"
      data-authenticated={isAuthenticated}
      data-saved={hasSavedPlan}
      data-adjustments={JSON.stringify(initialAdjustments)}
    />
  ),
}));
vi.mock("@/components/layouts/sidebar-shell", () => ({
  SidebarShell: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid="sidebar-shell">{children}</aside>
  ),
}));

import FinanceCushionPage from "@/app/finance/cushion/page";

describe("FinanceCushionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ plan: null, snapshots: [] });
  });

  it("uses the app sidebar shell for an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    render(await FinanceCushionPage());

    expect(screen.getByTestId("sidebar-shell")).toBeInTheDocument();
    expect(screen.getByTestId("household-runway")).toHaveAttribute(
      "data-authenticated",
      "true",
    );
  });

  it("keeps the anonymous experience outside the app sidebar shell", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    render(await FinanceCushionPage());

    expect(screen.queryByTestId("sidebar-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("household-runway")).toHaveAttribute(
      "data-authenticated",
      "false",
    );
  });

  it("does not hydrate persisted assessment adjustments into a working overlay", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.load.mockResolvedValue({
      plan: {
        revision: 4,
        inputs: createDefaultRunwayAnswers(new Date("2026-07-31T00:00:00.000Z")),
      },
      snapshots: [],
    });

    render(await FinanceCushionPage());

    expect(screen.getByTestId("household-runway")).not.toHaveAttribute(
      "data-adjustments",
    );
  });

  it("does not mark a retained row without versioned answers as saved", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.load.mockResolvedValue({ plan: null, snapshots: [] });

    render(await FinanceCushionPage());

    expect(screen.getByTestId("household-runway")).toHaveAttribute(
      "data-saved",
      "false",
    );
  });
});
