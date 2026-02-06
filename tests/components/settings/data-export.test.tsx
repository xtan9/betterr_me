import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataExport } from "@/components/settings/data-export";

// Hoist mock objects
const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        habits: "Export Habits",
        logs: "Export Logs",
        success: "Export downloaded successfully",
        error: "Failed to export data",
        dateRange: "Date Range",
        rangeAll: "All Time",
        range30: "Last 30 Days",
        range90: "Last 90 Days",
        range365: "Last Year",
        rangeCustom: "Custom Range",
        startDate: "Start Date",
        endDate: "End Date",
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn(() => "blob:test");
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Polyfill for Radix UI pointer events in jsdom
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("DataExport", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("renders export habits button", () => {
      render(<DataExport />);
      expect(
        screen.getByRole("button", { name: /export habits/i })
      ).toBeInTheDocument();
    });

    it("renders export logs button", () => {
      render(<DataExport />);
      expect(
        screen.getByRole("button", { name: /export logs/i })
      ).toBeInTheDocument();
    });

    it("renders date range selector", () => {
      render(<DataExport />);
      expect(screen.getByText("Date Range")).toBeInTheDocument();
    });
  });

  describe("export habits", () => {
    it("calls API with correct type parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          "Content-Disposition":
            'attachment; filename="betterrme-habits-2026-02-05.csv"',
        }),
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      render(<DataExport />);
      await user.click(
        screen.getByRole("button", { name: /export habits/i })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/export?type=habits");
      });
    });

    it("shows success toast on successful export", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      render(<DataExport />);
      await user.click(
        screen.getByRole("button", { name: /export habits/i })
      );

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          "Export downloaded successfully"
        );
      });
    });

    it("shows error toast on failed export", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<DataExport />);
      await user.click(
        screen.getByRole("button", { name: /export habits/i })
      );

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to export data");
      });
    });
  });

  describe("export logs", () => {
    it("calls API with correct type parameter when date range is all", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      render(<DataExport />);
      await user.click(
        screen.getByRole("button", { name: /export logs/i })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/export?type=logs");
      });
    });

    it("includes date params when a preset range is selected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      render(<DataExport />);

      // Open the select and choose "Last 30 Days"
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Last 30 Days"));

      // Export logs
      await user.click(
        screen.getByRole("button", { name: /export logs/i })
      );

      await waitFor(() => {
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain("type=logs");
        expect(url).toMatch(/startDate=\d{4}-\d{2}-\d{2}/);
        expect(url).toMatch(/endDate=\d{4}-\d{2}-\d{2}/);
      });
    });

    it("does not include date params for habits export even with range selected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(new Blob(["test"])),
      });

      render(<DataExport />);

      // Select a date range
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Last 30 Days"));

      // Export habits (not logs)
      await user.click(
        screen.getByRole("button", { name: /export habits/i })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/export?type=habits");
      });
    });
  });

  describe("custom date range", () => {
    it("shows custom date inputs when Custom Range is selected", async () => {
      render(<DataExport />);

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Custom Range"));

      expect(screen.getByLabelText("Start Date")).toBeInTheDocument();
      expect(screen.getByLabelText("End Date")).toBeInTheDocument();
    });

    it("hides custom date inputs for non-custom ranges", async () => {
      render(<DataExport />);

      expect(screen.queryByLabelText("Start Date")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("End Date")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("disables both buttons while exporting", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(promise);

      render(<DataExport />);
      await user.click(
        screen.getByRole("button", { name: /export habits/i })
      );

      // Both buttons should be disabled
      expect(
        screen.getByRole("button", { name: /export habits/i })
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /export logs/i })
      ).toBeDisabled();

      // Resolve the promise to clean up
      resolvePromise!({
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(new Blob(["test"])),
      });
    });
  });
});
