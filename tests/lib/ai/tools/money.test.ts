import { describe, it, expect, vi, beforeEach } from "vitest";
import { moneyTools } from "@/lib/ai/tools/money";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetByHousehold = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGetByMonth = vi.fn();
const mockGetSpendingByCategory = vi.fn();
const mockGetSpendingTrends = vi.fn();
const mockGetAccountsByHousehold = vi.fn();
const mockGetGoalsByHousehold = vi.fn();
const mockCreateGoal = vi.fn();
const mockUpdateGoal = vi.fn();
const mockDeleteGoal = vi.fn();
const mockAddContribution = vi.fn();
const mockGetBillsByHousehold = vi.fn();

vi.mock("@/lib/db", () => ({
  TransactionsDB: class {
    getByHousehold = mockGetByHousehold;
    create = mockCreate;
    update = mockUpdate;
  },
  BudgetsDB: class {
    getByMonth = mockGetByMonth;
    getSpendingByCategory = mockGetSpendingByCategory;
    getSpendingTrends = mockGetSpendingTrends;
  },
  MoneyAccountsDB: class {
    getByHousehold = mockGetAccountsByHousehold;
  },
  SavingsGoalsDB: class {
    getByHousehold = mockGetGoalsByHousehold;
    create = mockCreateGoal;
    update = mockUpdateGoal;
    delete = mockDeleteGoal;
    addContribution = mockAddContribution;
  },
  RecurringBillsDB: class {
    getByHousehold = mockGetBillsByHousehold;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    householdId: "hh-1",
    ...overrides,
  };
}

function findTool(name: string) {
  return moneyTools().find((t) => t.name === name)!;
}

describe("moneyTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 13 tool definitions", () => {
    const tools = moneyTools();
    expect(tools).toHaveLength(13);
  });

  it("updateTransaction returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("updateTransaction").execute(
      { transactionId: "t1", notes: "test" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("updateTransaction calls TransactionsDB.update", async () => {
    const ctx = makeCtx();
    mockUpdate.mockResolvedValue({ id: "t1" });
    await findTool("updateTransaction").execute(
      { transactionId: "t1", notes: "Updated" },
      ctx,
    );
    expect(mockUpdate).toHaveBeenCalledWith("t1", { notes: "Updated" });
  });

  it("getAccounts calls MoneyAccountsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetAccountsByHousehold.mockResolvedValue([
      { id: "a1", name: "Chequing" },
    ]);
    const result = await findTool("getAccounts").execute({}, ctx);
    expect(mockGetAccountsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "a1", name: "Chequing" }]);
  });

  it("getSavingsGoals calls SavingsGoalsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([
      { id: "g1", name: "Emergency Fund" },
    ]);
    const result = await findTool("getSavingsGoals").execute({}, ctx);
    expect(mockGetGoalsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "g1", name: "Emergency Fund" }]);
  });

  it("createSavingsGoal passes correct params", async () => {
    const ctx = makeCtx();
    mockCreateGoal.mockResolvedValue({ id: "g2" });
    await findTool("createSavingsGoal").execute(
      { name: "Vacation", targetCents: 500000 },
      ctx,
    );
    expect(mockCreateGoal).toHaveBeenCalledWith({
      household_id: "hh-1",
      owner_id: "user-123",
      name: "Vacation",
      target_cents: 500000,
      current_cents: 0,
      target_date: null,
      is_shared: false,
      linked_account_id: null,
    });
  });

  it("deleteSavingsGoal returns success", async () => {
    const ctx = makeCtx();
    mockDeleteGoal.mockResolvedValue(undefined);
    const result = await findTool("deleteSavingsGoal").execute(
      { goalId: "g1" },
      ctx,
    );
    expect(mockDeleteGoal).toHaveBeenCalledWith("g1");
    expect(result).toEqual({ success: true });
  });

  it("addSavingsContribution calls addContribution", async () => {
    const ctx = makeCtx();
    mockAddContribution.mockResolvedValue({ id: "c1" });
    await findTool("addSavingsContribution").execute(
      { goalId: "g1", amountCents: 10000, note: "Monthly" },
      ctx,
    );
    expect(mockAddContribution).toHaveBeenCalledWith("g1", 10000, "Monthly");
  });

  it("getRecurringBills calls RecurringBillsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetBillsByHousehold.mockResolvedValue([
      { id: "b1", name: "Netflix" },
    ]);
    const result = await findTool("getRecurringBills").execute({}, ctx);
    expect(mockGetBillsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "b1", name: "Netflix" }]);
  });

  it("getSpendingTrends defaults to 3 months", async () => {
    const ctx = makeCtx();
    mockGetSpendingTrends.mockResolvedValue([]);
    await findTool("getSpendingTrends").execute({}, ctx);
    expect(mockGetSpendingTrends).toHaveBeenCalledWith("hh-1", 3);
  });
});
