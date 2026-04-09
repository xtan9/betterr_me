import { z } from "zod";
import { WorkoutsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function workoutTools(): ToolDefinition[] {
  return [
    {
      name: "getRecentWorkouts",
      description: "Get recent completed workouts with exercise summaries",
      parameters: z.object({
        limit: z
          .number()
          .optional()
          .describe("Number of workouts to return (default 5)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getWorkoutsWithSummary(ctx.userId, {
          limit: params.limit ?? 5,
        });
      },
    },
    {
      name: "getActiveWorkout",
      description: "Get the user's currently active (in-progress) workout",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getActiveWorkout(ctx.userId);
      },
    },
  ];
}
