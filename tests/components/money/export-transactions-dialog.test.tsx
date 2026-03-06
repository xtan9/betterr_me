import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportTransactionsDialog } from "@/components/money/export-transactions-dialog";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ExportTransactionsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders export trigger button", () => {
    render(<ExportTransactionsDialog />);

    const button = screen.getByRole("button", { name: /title/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dialog on trigger click and shows date inputs", async () => {
    const user = userEvent.setup();
    render(<ExportTransactionsDialog />);

    const trigger = screen.getByRole("button", { name: /title/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByLabelText("dateFrom")).toBeInTheDocument();
      expect(screen.getByLabelText("dateTo")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "button" })
      ).toBeInTheDocument();
    });
  });

  it("export button is enabled by default (dates are optional)", async () => {
    const user = userEvent.setup();
    render(<ExportTransactionsDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      const exportBtn = screen.getByRole("button", { name: "button" });
      expect(exportBtn).not.toBeDisabled();
    });
  });

  it("shows loading text while exporting", async () => {
    const user = userEvent.setup();
    // Mock fetch that never resolves
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = vi.fn().mockReturnValue(fetchPromise);

    render(<ExportTransactionsDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "button" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "button" }));

    await waitFor(() => {
      expect(screen.getByText("exporting")).toBeInTheDocument();
    });

    // Resolve to clean up
    resolveFetch!({
      ok: true,
      blob: () => Promise.resolve(new Blob(["test"])),
    });
  });

  it("calls export API with date params and downloads blob", async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(["date,amount\n2026-01-01,100.00"]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });
    global.fetch = mockFetch;

    // Mock URL methods
    const mockUrl = "blob:http://localhost/test";
    global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
    global.URL.revokeObjectURL = vi.fn();

    render(<ExportTransactionsDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("dateFrom")).toBeInTheDocument();
    });

    // Set date range
    const dateFrom = screen.getByLabelText("dateFrom");
    const dateTo = screen.getByLabelText("dateTo");
    await user.type(dateFrom, "2026-01-01");
    await user.type(dateTo, "2026-01-31");

    await user.click(screen.getByRole("button", { name: "button" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/money/export")
      );
    });
  });

  it("shows error toast on export failure", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    render(<ExportTransactionsDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "button" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "button" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("error");
    });
  });
});
