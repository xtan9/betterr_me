import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRecurringGet } = vi.hoisted(() => ({
  mockRecurringGet: vi.fn(),
}));

vi.mock("@/lib/plaid/client", () => ({
  createPlaidClient: vi.fn(() => ({
    transactionsRecurringGet: mockRecurringGet,
  })),
}));

import { fetchRecurringTransactions } from "@/lib/plaid/recurring";

function stream(overrides: Record<string, unknown> = {}) {
  return {
    stream_id: "s-1",
    account_id: "acc-1",
    merchant_name: "Netflix",
    description: "NETFLIX.COM",
    last_amount: { amount: 15.49 },
    frequency: "MONTHLY",
    predicted_next_date: "2026-05-01",
    first_date: "2025-01-01",
    last_date: "2026-04-01",
    is_active: true,
    status: "MATURE",
    personal_finance_category: { primary: "ENTERTAINMENT" },
    ...overrides,
  };
}

describe("fetchRecurringTransactions", () => {
  beforeEach(() => {
    mockRecurringGet.mockReset();
  });

  it("transforms inflow and outflow streams and inverts the Plaid sign", async () => {
    mockRecurringGet.mockResolvedValue({
      data: {
        inflow_streams: [stream({ stream_id: "in-1", last_amount: { amount: -2000 } })],
        outflow_streams: [stream({ stream_id: "out-1", last_amount: { amount: 15.49 } })],
      },
    });

    const result = await fetchRecurringTransactions("access-token");

    expect(mockRecurringGet).toHaveBeenCalledWith({ access_token: "access-token" });

    // Inflow: plaid -2000 -> our +200000 cents (inflow positive in our sign)
    expect(result.inflows).toHaveLength(1);
    expect(result.inflows[0]).toMatchObject({
      plaid_stream_id: "in-1",
      amount_cents: 200000,
      frequency: "MONTHLY",
      category_primary: "ENTERTAINMENT",
    });

    // Outflow: plaid 15.49 -> our -1549 cents
    expect(result.outflows).toHaveLength(1);
    expect(result.outflows[0]).toMatchObject({
      plaid_stream_id: "out-1",
      amount_cents: -1549,
      merchant_name: "Netflix",
      description: "NETFLIX.COM",
      is_active: true,
      status: "MATURE",
    });
  });

  it("handles missing optional fields with null fallbacks", async () => {
    mockRecurringGet.mockResolvedValue({
      data: {
        inflow_streams: [],
        outflow_streams: [
          stream({
            last_amount: undefined,
            predicted_next_date: undefined,
            personal_finance_category: undefined,
          }),
        ],
      },
    });

    const { outflows } = await fetchRecurringTransactions("t");
    // toCents(-0) can return -0 — treat as zero
    expect(Math.abs(outflows[0].amount_cents)).toBe(0);
    expect(outflows[0].predicted_next_date).toBeNull();
    expect(outflows[0].category_primary).toBeNull();
  });

  it("returns empty arrays when Plaid returns no streams", async () => {
    mockRecurringGet.mockResolvedValue({
      data: { inflow_streams: [], outflow_streams: [] },
    });

    const result = await fetchRecurringTransactions("t");
    expect(result).toEqual({ inflows: [], outflows: [] });
  });
});
