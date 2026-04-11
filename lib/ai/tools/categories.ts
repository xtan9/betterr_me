import { z } from "zod";
import { CategoriesDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function categoryTools(): ToolDefinition[] {
  return [
    {
      name: "getCategories",
      description: "List all user categories (used for tasks, habits, etc.)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new CategoriesDB(ctx.supabase);
        return db.getUserCategories(ctx.userId);
      },
    },
    {
      name: "createCategory",
      description: "Create a new category for organizing tasks and habits",
      parameters: z.object({
        name: z.string().describe("Category name"),
        color: z.string().describe("Color hex code (e.g., #3B82F6)"),
        icon: z.string().optional().describe("Icon name"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CategoriesDB(ctx.supabase);
        return db.createCategory({
          user_id: ctx.userId,
          name: params.name,
          color: params.color,
          icon: params.icon ?? null,
          sort_order: 0,
        });
      },
    },
  ];
}
