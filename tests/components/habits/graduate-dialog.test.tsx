import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraduateDialog } from "@/components/habits/graduate-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

describe("GraduateDialog", () => {
  it("renders title and description when open", () => {
    render(
      <GraduateDialog
        open
        onOpenChange={vi.fn()}
        habitName="Meditation"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/graduate.confirm_title/)).toBeInTheDocument();
    expect(screen.getByText(/graduate.confirm_body/)).toBeInTheDocument();
  });

  it("calls onConfirm then onOpenChange(false) on CTA click", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <GraduateDialog
        open
        onOpenChange={onOpenChange}
        habitName="Meditation"
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /graduate.confirm_cta/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("Cancel closes without calling onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <GraduateDialog
        open
        onOpenChange={onOpenChange}
        habitName="Meditation"
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /graduate.confirm_cancel/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
