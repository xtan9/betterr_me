import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteMoneyDataDialog } from "@/components/money/delete-money-data-dialog";

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

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("DeleteMoneyDataDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders delete trigger button", () => {
    render(<DeleteMoneyDataDialog />);

    const button = screen.getByRole("button", { name: /button/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dialog with warning and confirmation input", async () => {
    const user = userEvent.setup();
    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      expect(screen.getByText("title")).toBeInTheDocument();
      expect(screen.getByText("description")).toBeInTheDocument();
      expect(screen.getByLabelText("confirmLabel")).toBeInTheDocument();
    });
  });

  it("submit button is disabled when input is empty", async () => {
    const user = userEvent.setup();
    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      // Find the destructive submit button inside the dialog (not the trigger)
      const buttons = screen.getAllByRole("button", { name: /button/i });
      // The last one is inside the dialog footer
      const submitButton = buttons[buttons.length - 1];
      expect(submitButton).toBeDisabled();
    });
  });

  it("submit button is disabled when input is incorrect (lowercase)", async () => {
    const user = userEvent.setup();
    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("confirmLabel")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("confirmLabel"), "delete");

    const buttons = screen.getAllByRole("button", { name: /button/i });
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton).toBeDisabled();
  });

  it("submit button is enabled when input is exactly DELETE", async () => {
    const user = userEvent.setup();
    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("confirmLabel")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("confirmLabel"), "DELETE");

    const buttons = screen.getAllByRole("button", { name: /button/i });
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton).not.toBeDisabled();
  });

  it("calls delete API on submit with DELETE confirmation", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("confirmLabel")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("confirmLabel"), "DELETE");

    const buttons = screen.getAllByRole("button", { name: /button/i });
    const submitButton = buttons[buttons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/money/delete-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("success");
      expect(mockPush).toHaveBeenCalledWith("/money");
    });
  });

  it("shows error toast on delete failure", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    render(<DeleteMoneyDataDialog />);

    await user.click(screen.getByRole("button", { name: /button/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("confirmLabel")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("confirmLabel"), "DELETE");

    const buttons = screen.getAllByRole("button", { name: /button/i });
    const submitButton = buttons[buttons.length - 1];
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("error");
    });
  });
});
