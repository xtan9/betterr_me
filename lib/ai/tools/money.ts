import { z } from "zod";
import { TransactionsDB, BudgetsDB } from "@/lib/db";
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
  ];
}
