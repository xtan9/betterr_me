import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key;
      for (const [k, v] of Object.entries(params)) {
        result += ` ${k}:${v}`;
      }
      return result;
    }
    return key;
  },
}));

const defaultProps = {
  mediaCount: 42,
  totalExercises: 100,
  lastSyncDate: "2026-01-15T10:00:00Z",
};

describe("AdminDashboardContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders sync card with initial stats", () => {
    render(<AdminDashboardContent {...defaultProps} />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("sync.title")).toBeInTheDocument();
    expect(screen.getByText("sync.description")).toBeInTheDocument();
    expect(
      screen.getByText("sync.currentStats count:42 total:100")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sync\.lastSync/)
    ).toBeInTheDocument();
  });

  it("shows neverSynced when lastSyncDate is null", () => {
    render(
      <AdminDashboardContent {...defaultProps} lastSyncDate={null} />
    );

    expect(screen.getByText("sync.neverSynced")).toBeInTheDocument();
  });

  it("sync button triggers API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ matched: 80, unmatched: 20 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<AdminDashboardContent {...defaultProps} />);

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/sync-exercise-media",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ dryRun: true }),
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("sync.resultMatched count:80")
      ).toBeInTheDocument();
      expect(
        screen.getByText("sync.resultUnmatched count:20")
      ).toBeInTheDocument();
    });
  });

  it("dry run toggle passes flag to API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ matched: 10, unmatched: 5 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<AdminDashboardContent {...defaultProps} />);

    // Toggle dry run off
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/sync-exercise-media",
        expect.objectContaining({
          body: JSON.stringify({ dryRun: false }),
        })
      );
    });
  });

  it("shows error state on API failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<AdminDashboardContent {...defaultProps} />);

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("sync.error");
    });
  });

  it("shows error state on network failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    render(<AdminDashboardContent {...defaultProps} />);

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("sync.error");
    });
  });
});
