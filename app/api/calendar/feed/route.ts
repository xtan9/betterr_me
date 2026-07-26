import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CalendarEventsDB } from "@/lib/db";
import { expandEventsForRange } from "@/lib/calendar/recurrence";
import { log } from "@/lib/logger";
import {
  normalizeEvents,
  normalizeTasks,
  normalizeHabits,
  normalizeWorkouts,
} from "@/lib/calendar/feed-aggregation";
import type { CalendarFeedItem } from "@/lib/calendar/feed-types";
import type { Task, Habit, HabitLog, Workout } from "@/lib/db/types";

/**
 * GET /api/calendar/feed
 *
 * Unified feed API returning all domain items for a date range.
 * Query parameters (required):
 * - start_date: YYYY-MM-DD
 * - end_date: YYYY-MM-DD
 * - layers: comma-separated domain keys (e.g., "events,tasks,habits")
 *
 * Response: { items: CalendarFeedItem[] }
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
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const layersParam = searchParams.get("layers") || "events";
    const timezone = searchParams.get("timezone") || undefined;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date query parameters are required" },
        { status: 400 },
      );
    }
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "start_date and end_date must be in YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const enabledLayers = new Set(layersParam.split(",").filter(Boolean));

    // Validate layers parameter
    const validLayers = new Set(["events", "tasks", "habits", "workouts"]);
    const invalidLayers = [...enabledLayers].filter((l) => !validLayers.has(l));
    if (invalidLayers.length > 0) {
      return NextResponse.json(
        { error: `Invalid layers: ${invalidLayers.join(", ")}` },
        { status: 400 },
      );
    }

    // Fetch all enabled domains in parallel
    const promises: Promise<CalendarFeedItem[]>[] = [];
    const requestedLayers: string[] = [];

    if (enabledLayers.has("events")) {
      requestedLayers.push("events");
      promises.push(
        (async () => {
          const db = new CalendarEventsDB(supabase);
          const events = await db.getUserEvents(user.id, startDate, endDate);
          const expanded = expandEventsForRange(events, startDate, endDate);
          return normalizeEvents(expanded);
        })(),
      );
    }

    if (enabledLayers.has("tasks")) {
      requestedLayers.push("tasks");
      promises.push(
        (async () => {
          const { data, error } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", user.id)
            .not("due_date", "is", null)
            .gte("due_date", startDate)
            .lte("due_date", endDate);
          if (error) throw error;
          return normalizeTasks((data as Task[]) || []);
        })(),
      );
    }

    if (enabledLayers.has("habits")) {
      requestedLayers.push("habits");
      promises.push(
        (async () => {
          // Fetch active habits
          const { data: habits, error: habitsError } = await supabase
            .from("habits")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active");
          if (habitsError) throw habitsError;

          // Fetch completed logs in date range
          const { data: logs, error: logsError } = await supabase
            .from("habit_logs")
            .select("*")
            .eq("user_id", user.id)
            .eq("completed", true)
            .gte("logged_date", startDate)
            .lte("logged_date", endDate);
          if (logsError) throw logsError;

          return normalizeHabits(
            (habits as Habit[]) || [],
            (logs as HabitLog[]) || [],
            startDate,
            endDate,
          );
        })(),
      );
    }

    if (enabledLayers.has("workouts")) {
      requestedLayers.push("workouts");
      promises.push(
        (async () => {
          // Workouts use started_at (timestamp) — filter by date portion
          const { data, error } = await supabase
            .from("workouts")
            .select("*")
            .eq("user_id", user.id)
            .neq("status", "in_progress")
            .gte("started_at", `${startDate}T00:00:00`)
            .lte("started_at", `${endDate}T23:59:59`);
          if (error) throw error;
          return normalizeWorkouts((data as Workout[]) || [], timezone);
        })(),
      );
    }

    const settled = await Promise.allSettled(promises);
    const items: CalendarFeedItem[] = [];
    const partialFailures: string[] = [];

    settled.forEach((result, i) => {
      if (result.status === "fulfilled") {
        items.push(...result.value);
      } else {
        const domain = requestedLayers[i] || `domain-${i}`;
        log.error(`Feed domain query failed: ${domain}`, result.reason);
        partialFailures.push(domain);
      }
    });

    return NextResponse.json({
      items,
      ...(partialFailures.length > 0 && { partialFailures }),
    });
  } catch (error) {
    log.error("GET /api/calendar/feed error", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar feed" },
      { status: 500 },
    );
  }
}
