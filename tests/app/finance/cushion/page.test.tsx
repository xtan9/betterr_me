import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getFinanceCushion: vi.fn(),
  getRunwaySnapshots: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));
vi.mock("@/lib/finance/repository", () => ({
  getFinanceCushion: mocks.getFinanceCushion,
  getRunwaySnapshots: mocks.getRunwaySnapshots,
}));
vi.mock("@/components/finance/household-runway", () => ({
  HouseholdRunway: ({ isAuthenticated }: { isAuthenticated: boolean }) => (
    <div data-testid="household-runway" data-authenticated={isAuthenticated} />
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
    mocks.getFinanceCushion.mockResolvedValue(null);
    mocks.getRunwaySnapshots.mockResolvedValue([]);
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
});
