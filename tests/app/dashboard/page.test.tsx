import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardData } from "@/lib/db/types";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));
vi.mock("@/components/dashboard/dashboard-content", () => ({
  DashboardContent: ({ initialData }: { initialData?: DashboardData }) => (
    <output data-testid="dashboard-data">
      {initialData === undefined ? "client-date-pending" : JSON.stringify(initialData)}
    </output>
  ),
}));

import DashboardPage from "@/app/dashboard/page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00"));
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "alex@example.com",
          user_metadata: {},
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers snapshot loading until the browser-local date is available", async () => {
    // At this instant a UTC server is on July 29 while a UTC-7 browser is
    // still on July 28. The server must not acquire a July 29 snapshot.
    vi.setSystemTime(new Date("2026-07-29T03:30:00.000Z"));
    render(await DashboardPage());

    expect(screen.getByTestId("dashboard-data")).toHaveTextContent(
      "client-date-pending",
    );
  });
});
