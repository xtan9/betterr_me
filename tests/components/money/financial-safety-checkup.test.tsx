import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinancialSafetyCheckup } from "@/components/money/financial-safety-checkup";

describe("FinancialSafetyCheckup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores a saved draft and persists edits on return", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ checkup: { inputs: { accessibleCashCents: 125000, essentialMonthlyExpensesCents: 42000, myMonthlyIncomeCents: 0 } } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ checkup: { id: "draft-1" } }) } as Response);
    const user = userEvent.setup();
    render(<FinancialSafetyCheckup />);
    await waitFor(() => expect(screen.getByLabelText("Accessible cash")).toHaveValue("1250.00"));
    await user.clear(screen.getByLabelText("Essential monthly costs"));
    await user.type(screen.getByLabelText("Essential monthly costs"), "500");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith("/api/money/financial-safety-checkup", expect.objectContaining({ method: "POST" })));
    const request = vi.mocked(global.fetch).mock.calls[1][1]!;
    expect(JSON.parse(request.body as string).inputs).toMatchObject({ accessibleCashCents: 125000, essentialMonthlyExpensesCents: 50000 });
    expect(screen.getByText("Saved. You can return any time to continue.")).toBeInTheDocument();
  });
});
