import { describe, it, expect, vi, beforeEach } from "vitest";
import { moneyTools } from "@/lib/ai/tools/money";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetByHousehold = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGetById = vi.fn();
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
    getById = mockGetById;
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

  it("updateTransaction verifies ownership then updates", async () => {
    const ctx = makeCtx();
    mockGetById.mockResolvedValue({ id: "t1", household_id: "hh-1" });
    mockUpdate.mockResolvedValue({ id: "t1" });
    await findTool("updateTransaction").execute(
      { transactionId: "t1", notes: "Updated" },
      ctx,
    );
    expect(mockGetById).toHaveBeenCalledWith("t1");
    expect(mockUpdate).toHaveBeenCalledWith("t1", { notes: "Updated" });
  });

  it("updateTransaction returns error for wrong household", async () => {
    const ctx = makeCtx();
    mockGetById.mockResolvedValue({ id: "t1", household_id: "other-hh" });
    const result = await findTool("updateTransaction").execute(
      { transactionId: "t1", notes: "test" },
      ctx,
    );
    expect(result).toEqual({ error: "Transaction not found" });
    expect(mockUpdate).not.toHaveBeenCalled();
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
      deadline: null,
      funding_type: "manual",
      linked_account_id: null,
      icon: null,
      color: null,
      status: "active",
      is_shared: false,
    });
  });

  it("updateSavingsGoal verifies ownership and transforms params", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "g1" }]);
    mockUpdateGoal.mockResolvedValue({ id: "g1", name: "Renamed" });
    await findTool("updateSavingsGoal").execute(
      { goalId: "g1", name: "Renamed", targetCents: 200000 },
      ctx,
    );
    expect(mockGetGoalsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(mockUpdateGoal).toHaveBeenCalledWith("g1", {
      name: "Renamed",
      target_cents: 200000,
    });
  });

  it("deleteSavingsGoal verifies ownership then deletes", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "g1" }]);
    mockDeleteGoal.mockResolvedValue(undefined);
    const result = await findTool("deleteSavingsGoal").execute(
      { goalId: "g1" },
      ctx,
    );
    expect(mockGetGoalsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(mockDeleteGoal).toHaveBeenCalledWith("g1");
    expect(result).toEqual({ success: true });
  });

  it("deleteSavingsGoal returns error when goal not in household", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "other-goal" }]);
    const result = await findTool("deleteSavingsGoal").execute(
      { goalId: "g1" },
      ctx,
    );
    expect(result).toEqual({ error: "Savings goal not found" });
    expect(mockDeleteGoal).not.toHaveBeenCalled();
  });

  it("addSavingsContribution verifies ownership then adds", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "g1" }]);
    mockAddContribution.mockResolvedValue({ id: "c1" });
    await findTool("addSavingsContribution").execute(
      { goalId: "g1", amountCents: 10000, note: "Monthly" },
      ctx,
    );
    expect(mockGetGoalsByHousehold).toHaveBeenCalledWith("hh-1");
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

  it("getSpendingTrends respects custom months param", async () => {
    const ctx = makeCtx();
    mockGetSpendingTrends.mockResolvedValue([]);
    await findTool("getSpendingTrends").execute({ months: 6 }, ctx);
    expect(mockGetSpendingTrends).toHaveBeenCalledWith("hh-1", 6);
  });

  it("getSpendingTrends returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getSpendingTrends").execute({}, ctx);
    expect(result).toEqual({ error: "No household found" });
    expect(mockGetSpendingTrends).not.toHaveBeenCalled();
  });

  it("getRecentTransactions defaults to limit 20 and returns transactions", async () => {
    const ctx = makeCtx();
    mockGetByHousehold.mockResolvedValue({
      transactions: [{ id: "t1", description: "Coffee" }],
    });
    const result = await findTool("getRecentTransactions").execute({}, ctx);
    expect(mockGetByHousehold).toHaveBeenCalledWith("hh-1", {
      limit: 20,
      category: undefined,
    });
    expect(result).toEqual([{ id: "t1", description: "Coffee" }]);
  });

  it("getRecentTransactions passes limit and category", async () => {
    const ctx = makeCtx();
    mockGetByHousehold.mockResolvedValue({ transactions: [] });
    await findTool("getRecentTransactions").execute(
      { limit: 5, category: "Food" },
      ctx,
    );
    expect(mockGetByHousehold).toHaveBeenCalledWith("hh-1", {
      limit: 5,
      category: "Food",
    });
  });

  it("getRecentTransactions returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getRecentTransactions").execute({}, ctx);
    expect(result).toEqual({ error: "No household found" });
  });

  it("getBudgetStatus calls BudgetsDB.getByMonth", async () => {
    const ctx = makeCtx();
    mockGetByMonth.mockResolvedValue({ month: "2026-04", spent: 100 });
    const result = await findTool("getBudgetStatus").execute(
      { month: "2026-04" },
      ctx,
    );
    expect(mockGetByMonth).toHaveBeenCalledWith("hh-1", "2026-04");
    expect(result).toEqual({ month: "2026-04", spent: 100 });
  });

  it("getBudgetStatus returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getBudgetStatus").execute(
      { month: "2026-04" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("getSpendingSummary calls BudgetsDB.getSpendingByCategory", async () => {
    const ctx = makeCtx();
    mockGetSpendingByCategory.mockResolvedValue([{ category: "Food", total_cents: 50000 }]);
    const result = await findTool("getSpendingSummary").execute(
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      ctx,
    );
    expect(mockGetSpendingByCategory).toHaveBeenCalledWith(
      "hh-1",
      "2026-04-01",
      "2026-04-30",
    );
    expect(result).toEqual([{ category: "Food", total_cents: 50000 }]);
  });

  it("getSpendingSummary returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getSpendingSummary").execute(
      { dateFrom: "2026-04-01", dateTo: "2026-04-30" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("addTransaction creates a transaction with provided date", async () => {
    const ctx = makeCtx();
    mockCreate.mockResolvedValue({ id: "t1" });
    await findTool("addTransaction").execute(
      {
        description: "Lunch",
        amountCents: -1500,
        accountId: "acc-1",
        categoryId: "cat-1",
        date: "2026-04-05",
      },
      ctx,
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: "hh-1",
        account_id: "acc-1",
        description: "Lunch",
        amount_cents: -1500,
        category_id: "cat-1",
        transaction_date: "2026-04-05",
        source: "manual",
      }),
    );
  });

  it("addTransaction falls back to ctx.date and nulls categoryId", async () => {
    const ctx = makeCtx();
    mockCreate.mockResolvedValue({ id: "t2" });
    await findTool("addTransaction").execute(
      {
        description: "Coffee",
        amountCents: -500,
        accountId: "acc-1",
      },
      ctx,
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_date: "2026-04-10",
        category_id: null,
      }),
    );
  });

  it("addTransaction returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("addTransaction").execute(
      { description: "x", amountCents: 1, accountId: "a" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("updateTransaction handles categoryId transformation", async () => {
    const ctx = makeCtx();
    mockGetById.mockResolvedValue({ id: "t1", household_id: "hh-1" });
    mockUpdate.mockResolvedValue({ id: "t1" });
    await findTool("updateTransaction").execute(
      { transactionId: "t1", categoryId: "cat-new", notes: "n" },
      ctx,
    );
    expect(mockUpdate).toHaveBeenCalledWith("t1", {
      notes: "n",
      category_id: "cat-new",
    });
  });

  it("updateTransaction returns error when txn is null", async () => {
    const ctx = makeCtx();
    mockGetById.mockResolvedValue(null);
    const result = await findTool("updateTransaction").execute(
      { transactionId: "missing", notes: "x" },
      ctx,
    );
    expect(result).toEqual({ error: "Transaction not found" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("getAccounts returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getAccounts").execute({}, ctx);
    expect(result).toEqual({ error: "No household found" });
  });

  it("getSavingsGoals returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getSavingsGoals").execute({}, ctx);
    expect(result).toEqual({ error: "No household found" });
  });

  it("createSavingsGoal sets deadline when targetDate provided", async () => {
    const ctx = makeCtx();
    mockCreateGoal.mockResolvedValue({ id: "g3" });
    await findTool("createSavingsGoal").execute(
      { name: "Car", targetCents: 1000000, targetDate: "2027-01-01" },
      ctx,
    );
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: "2027-01-01" }),
    );
  });

  it("createSavingsGoal returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("createSavingsGoal").execute(
      { name: "X", targetCents: 100 },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("updateSavingsGoal returns error when goal not in household", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "other" }]);
    const result = await findTool("updateSavingsGoal").execute(
      { goalId: "g1", name: "X" },
      ctx,
    );
    expect(result).toEqual({ error: "Savings goal not found" });
    expect(mockUpdateGoal).not.toHaveBeenCalled();
  });

  it("updateSavingsGoal returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("updateSavingsGoal").execute(
      { goalId: "g1" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("updateSavingsGoal transforms targetDate to deadline", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "g1" }]);
    mockUpdateGoal.mockResolvedValue({ id: "g1" });
    await findTool("updateSavingsGoal").execute(
      { goalId: "g1", targetDate: "2027-12-31" },
      ctx,
    );
    expect(mockUpdateGoal).toHaveBeenCalledWith("g1", {
      deadline: "2027-12-31",
    });
  });

  it("deleteSavingsGoal returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("deleteSavingsGoal").execute(
      { goalId: "g1" },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("addSavingsContribution returns error when goal not in household", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "other" }]);
    const result = await findTool("addSavingsContribution").execute(
      { goalId: "g1", amountCents: 100 },
      ctx,
    );
    expect(result).toEqual({ error: "Savings goal not found" });
    expect(mockAddContribution).not.toHaveBeenCalled();
  });

  it("addSavingsContribution returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("addSavingsContribution").execute(
      { goalId: "g1", amountCents: 100 },
      ctx,
    );
    expect(result).toEqual({ error: "No household found" });
  });

  it("getRecurringBills returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("getRecurringBills").execute({}, ctx);
    expect(result).toEqual({ error: "No household found" });
  });
});
