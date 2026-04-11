import { z } from "zod";
import {
  TransactionsDB,
  BudgetsDB,
  MoneyAccountsDB,
  SavingsGoalsDB,
  RecurringBillsDB,
} from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function moneyTools(): ToolDefinition[] {
  return [
    {
      name: "getRecentTransactions",
      description: "Get recent financial transactions",
      parameters: z.object({
        limit: z.number().optional().describe("Number of transactions to return (default 20)"),
        category: z.string().optional().describe("Filter by category name"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new TransactionsDB(ctx.supabase);
        const { transactions } = await db.getByHousehold(ctx.householdId, {
          limit: params.limit ?? 20,
          category: params.category,
        });
        return transactions;
      },
    },
    {
      name: "getBudgetStatus",
      description: "Get the budget and spending status for a given month",
      parameters: z.object({
        month: z.string().describe("Month in YYYY-MM format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new BudgetsDB(ctx.supabase);
        return db.getByMonth(ctx.householdId, params.month);
      },
    },
    {
      name: "getSpendingSummary",
      description: "Get spending aggregated by category for a date range",
      parameters: z.object({
        dateFrom: z.string().describe("Start date in YYYY-MM-DD format"),
        dateTo: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new BudgetsDB(ctx.supabase);
        return db.getSpendingByCategory(ctx.householdId, params.dateFrom, params.dateTo);
      },
    },
    {
      name: "addTransaction",
      description: "Add a new financial transaction. Always confirm with the user before calling this tool.",
      parameters: z.object({
        description: z.string().describe("Transaction description"),
        amountCents: z.number().describe("Amount in cents (positive for income, negative for expense)"),
        categoryId: z.string().optional().describe("Category ID"),
        accountId: z.string().describe("Account ID for the transaction"),
        date: z.string().optional().describe("Transaction date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new TransactionsDB(ctx.supabase);
        return db.create({
          household_id: ctx.householdId,
          account_id: params.accountId,
          description: params.description,
          amount_cents: params.amountCents,
          category_id: params.categoryId ?? null,
          category: null,
          merchant_name: null,
          notes: null,
          transaction_date: params.date ?? ctx.date,
          is_pending: false,
          is_hidden_from_household: false,
          is_shared_to_household: false,
          plaid_transaction_id: null,
          plaid_category_primary: null,
          plaid_category_detailed: null,
          source: "manual",
        });
      },
    },
    {
      name: "updateTransaction",
      description: "Update a transaction's category or notes",
      parameters: z.object({
        transactionId: z.string().describe("The transaction ID"),
        categoryId: z.string().optional().describe("New category ID"),
        notes: z.string().optional().describe("New notes"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new TransactionsDB(ctx.supabase);
        const { transactionId, categoryId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (categoryId !== undefined) updates.category_id = categoryId;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.update(
          transactionId,
          updates as Partial<
            Pick<
              import("@/lib/db").Transaction,
              "category_id" | "notes" | "category"
            >
          >,
        );
      },
    },
    {
      name: "getAccounts",
      description:
        "List all financial accounts (bank accounts, credit cards, cash)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new MoneyAccountsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "getSavingsGoals",
      description: "List all savings goals with progress",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "createSavingsGoal",
      description:
        "Create a new savings goal. Always confirm with the user first.",
      parameters: z.object({
        name: z
          .string()
          .describe("Goal name (e.g., 'Emergency Fund')"),
        targetCents: z
          .number()
          .describe("Target amount in cents (e.g., 100000 for $1000)"),
        targetDate: z
          .string()
          .optional()
          .describe("Target date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.create({
          household_id: ctx.householdId,
          owner_id: ctx.userId,
          name: params.name,
          target_cents: params.targetCents,
          current_cents: 0,
          target_date: params.targetDate ?? null,
          is_shared: false,
          linked_account_id: null,
        });
      },
    },
    {
      name: "updateSavingsGoal",
      description: "Update a savings goal's name, target, or date",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
        name: z.string().optional().describe("New name"),
        targetCents: z
          .number()
          .optional()
          .describe("New target in cents"),
        targetDate: z.string().optional().describe("New target date"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        const { goalId, targetCents, targetDate, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (targetCents !== undefined) updates.target_cents = targetCents;
        if (targetDate !== undefined) updates.target_date = targetDate;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.update(
          goalId,
          updates as import("@/lib/db").SavingsGoalUpdate,
        );
      },
    },
    {
      name: "deleteSavingsGoal",
      description:
        "Delete a savings goal and all its contributions. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        await db.delete(params.goalId);
        return { success: true };
      },
    },
    {
      name: "addSavingsContribution",
      description:
        "Add money toward a savings goal. Always confirm with the user first.",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
        amountCents: z.number().describe("Amount in cents to add"),
        note: z
          .string()
          .optional()
          .describe("Note for this contribution"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.addContribution(
          params.goalId,
          params.amountCents,
          params.note,
        );
      },
    },
    {
      name: "getRecurringBills",
      description: "List all recurring bills and subscriptions",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new RecurringBillsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "getSpendingTrends",
      description:
        "Get spending trends by category across the last N months",
      parameters: z.object({
        months: z
          .number()
          .optional()
          .describe("Number of months to analyze (default 3)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new BudgetsDB(ctx.supabase);
        return db.getSpendingTrends(
          ctx.householdId,
          params.months ?? 3,
        );
      },
    },
  ];
}
