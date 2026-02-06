import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB } from "@/lib/db";
import {
  exportHabitsToCSV,
  exportLogsToCSV,
  type HabitLogWithName,
} from "@/lib/export/csv";
import type { Habit, HabitLog } from "@/lib/db/types";

/**
 * GET /api/export
 * Export user data as CSV
 *
 * Query parameters:
 * - type: 'habits' | 'logs' (required)
 * - startDate: YYYY-MM-DD (optional, logs only)
 * - endDate: YYYY-MM-DD (optional, logs only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");

    if (!type || !["habits", "logs"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid export type. Must be 'habits' or 'logs'" },
        { status: 400 }
      );
    }

    const date = new Date().toISOString().split("T")[0];

    if (type === "habits") {
      // Export all habits
      const habitsDB = new HabitsDB(supabase);
      const habits = await habitsDB.getUserHabits(user.id);

      const csv = exportHabitsToCSV(habits);
      const filename = `betterrme-habits-${date}.csv`;

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (type === "logs") {
      // Export logs with habit names, optionally filtered by date range
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");

      // Validate date format and semantic validity if provided
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const isValidDate = (d: string) =>
        dateRegex.test(d) && !isNaN(new Date(d).getTime());

      if (startDate && !isValidDate(startDate)) {
        return NextResponse.json(
          { error: "Invalid startDate. Use a valid YYYY-MM-DD date" },
          { status: 400 }
        );
      }
      if (endDate && !isValidDate(endDate)) {
        return NextResponse.json(
          { error: "Invalid endDate. Use a valid YYYY-MM-DD date" },
          { status: 400 }
        );
      }

      // First get all habits for name lookup
      const habitsDB = new HabitsDB(supabase);
      const habits = await habitsDB.getUserHabits(user.id);
      const habitMap = new Map(habits.map((h: Habit) => [h.id, h.name]));

      // Get logs for user with optional date filtering
      let query = supabase
        .from("habit_logs")
        .select("*")
        .eq("user_id", user.id);

      if (startDate) {
        query = query.gte("logged_date", startDate);
      }
      if (endDate) {
        query = query.lte("logged_date", endDate);
      }

      const { data: logs, error } = await query.order("logged_date", {
        ascending: false,
      });

      if (error) throw error;

      // Add habit names to logs
      const logsWithNames: HabitLogWithName[] = (logs || []).map(
        (log: HabitLog) => ({
          ...log,
          habit_name: habitMap.get(log.habit_id) || "Unknown",
        })
      );

      const csv = exportLogsToCSV(logsWithNames);
      const filename = `betterrme-logs-${date}.csv`;

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
