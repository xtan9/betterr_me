import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CsvImportDialog } from "@/components/money/csv-import-dialog";

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

// Mock SWR config
vi.mock("swr", () => ({
  default: vi.fn(),
  useSWRConfig: () => ({
    mutate: vi.fn(),
  }),
}));

// Mock useAccounts hook
vi.mock("@/lib/hooks/use-accounts", () => ({
  useAccounts: () => ({
    connections: [
      {
        id: "conn-1",
        accounts: [
          { id: "acct-1", name: "Checking", mask: "1234" },
          { id: "acct-2", name: "Savings", mask: "5678" },
        ],
        sync_status: "synced",
      },
    ],
    netWorthCents: 0,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

// Mock PapaParse
vi.mock("papaparse", () => ({
  default: {
    parse: vi.fn((_file: unknown, options: { complete: (results: { meta: { fields: string[] }; data: Record<string, string>[] }) => void }) => {
      options.complete({
        meta: { fields: ["Date", "Amount", "Description", "Merchant"] },
        data: [
          { Date: "2026-01-15", Amount: "-15.50", Description: "Coffee", Merchant: "Starbucks" },
          { Date: "2026-01-16", Amount: "-25.00", Description: "Lunch", Merchant: "Subway" },
        ],
      });
    }),
  },
}));

describe("CsvImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders import trigger button", () => {
    render(<CsvImportDialog />);

    const button = screen.getByRole("button", { name: /title/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dialog on click and shows file upload area", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    const trigger = screen.getByRole("button", { name: /title/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("selectFile")).toBeInTheDocument();
      expect(screen.getByText("dragDrop")).toBeInTheDocument();
    });
  });

  it("shows account selector with accounts and cash option", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("selectAccount")).toBeInTheDocument();
      // The Cash option is in the select (default value)
      expect(screen.getByText("Cash")).toBeInTheDocument();
    });
  });

  it("shows flip sign checkbox", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("flipSign")).toBeInTheDocument();
      expect(screen.getByText("flipSignHelp")).toBeInTheDocument();
    });
  });

  it("shows step 1 title when dialog opens", async () => {
    const user = userEvent.setup();
    render(<CsvImportDialog />);

    await user.click(screen.getByRole("button", { name: /title/i }));

    await waitFor(() => {
      expect(screen.getByText("step1Title")).toBeInTheDocument();
    });
  });
});
