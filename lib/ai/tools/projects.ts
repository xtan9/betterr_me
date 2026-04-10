import { z } from "zod";
import { ProjectsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function projectTools(): ToolDefinition[] {
  return [
    {
      name: "getProjects",
      description:
        "List the user's projects, optionally filtered by section and status",
      parameters: z.object({
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("Filter by section"),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("Filter by status (default: active)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        return db.getUserProjects(ctx.userId, {
          section: params.section,
          status: params.status ?? "active",
        });
      },
    },
  ];
}
