import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReactivateDialog } from "@/components/habits/reactivate-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

describe("ReactivateDialog", () => {
  it("renders title and description with best streak", () => {
    render(
      <ReactivateDialog
        open
        onOpenChange={vi.fn()}
        habitName="Meditation"
        bestStreak={120}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/reactivate.confirm_title/)).toBeInTheDocument();
    // body text should mention 120 via the `n` interpolation
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it("calls onConfirm then onOpenChange(false) on CTA click", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ReactivateDialog
        open
        onOpenChange={onOpenChange}
        habitName="Meditation"
        bestStreak={120}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /reactivate.confirm_cta/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("Cancel closes without calling onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ReactivateDialog
        open
        onOpenChange={onOpenChange}
        habitName="Meditation"
        bestStreak={120}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /reactivate.confirm_cancel/ })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
