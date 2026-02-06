import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB } from "@/lib/db";
import {
  exportHabitsToCSV,
  exportLogsToCSV,
  type HabitLogWithName,
} from "@/lib/export/csv";
import type { Habit, HabitLog } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (d: string) =>
  dateRegex.test(d) && !isNaN(new Date(d).getTime());

/** Fetch all habits for a user. */
async function fetchHabits(supabase: SupabaseClient, userId: string) {
  const habitsDB = new HabitsDB(supabase);
  return habitsDB.getUserHabits(userId);
}

/** Fetch habit logs with enriched habit names, optionally filtered by date range. */
async function fetchLogsWithNames(
  supabase: SupabaseClient,
  userId: string,
  habits: Habit[],
  startDate?: string | null,
  endDate?: string | null
): Promise<HabitLogWithName[]> {
  const habitMap = new Map(habits.map((h) => [h.id, h.name]));

  let query = supabase
    .from("habit_logs")
    .select("*")
    .eq("user_id", userId);

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

  return (logs || []).map((log: HabitLog) => ({
    ...log,
    habit_name: habitMap.get(log.habit_id) || "Unknown",
  }));
}

/**
 * Validate optional date parameters. Returns an error response if invalid, or null if valid.
 */
function validateDateParams(
  startDate: string | null,
  endDate: string | null
): NextResponse | null {
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
  return null;
}

/**
 * GET /api/export
 * Export user data as CSV or ZIP.
 *
 * Query parameters:
 * - type: 'habits' | 'logs' | 'zip' (required)
 * - startDate: YYYY-MM-DD (optional, logs and zip only)
 * - endDate: YYYY-MM-DD (optional, logs and zip only)
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

    if (!type || !["habits", "logs", "zip"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid export type. Must be 'habits', 'logs', or 'zip'" },
        { status: 400 }
      );
    }

    const date = new Date().toISOString().split("T")[0];

    if (type === "habits") {
      const habits = await fetchHabits(supabase, user.id);
      const csv = exportHabitsToCSV(habits);
      const filename = `betterrme-habits-${date}.csv`;

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Both "logs" and "zip" support date-range filtering
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const dateError = validateDateParams(startDate, endDate);
    if (dateError) return dateError;

    if (type === "logs") {
      const habits = await fetchHabits(supabase, user.id);
      const logsWithNames = await fetchLogsWithNames(
        supabase,
        user.id,
        habits,
        startDate,
        endDate
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

    if (type === "zip") {
      const habits = await fetchHabits(supabase, user.id);
      const logsWithNames = await fetchLogsWithNames(
        supabase,
        user.id,
        habits,
        startDate,
        endDate
      );

      const zip = new JSZip();
      zip.file("habits.csv", exportHabitsToCSV(habits));
      zip.file("logs.csv", exportLogsToCSV(logsWithNames));

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const filename = `betterrme-export-${date}.zip`;

      return new NextResponse(zipBuffer, {
        headers: {
          "Content-Type": "application/zip",
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
