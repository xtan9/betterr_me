import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { HabitsDB, TasksDB } from "@/lib/db";
import { getLocalDateString } from "@/lib/utils";
import { log } from "@/lib/logger";
import { ensureRecurringTaskCoverageThrough } from "@/lib/recurring-tasks/coverage";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const habitsDB = new HabitsDB(supabase);
    const tasksDB = new TasksDB(supabase);

    // Accept date from query param (client sends local date)
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || getLocalDateString();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const recurringCoverage = await ensureRecurringTaskCoverageThrough(
      supabase,
      userId,
      date,
      date,
    );
    if (recurringCoverage.status === "partial") {
      return NextResponse.json(
        { error: "Recurring task coverage is temporarily unavailable" },
        { status: 503 },
      );
    }

    // Run both queries in parallel
    const [habitsWithStatus, tasksDueToday] = await Promise.all([
      habitsDB.getHabitsWithTodayStatus(userId, date),
      tasksDB.getTodayTasks(userId, date),
    ]);

    // Count incomplete habits (active habits not completed today)
    const habitsIncomplete = habitsWithStatus.filter(
      (h) => !h.completed_today
    ).length;

    // Count incomplete tasks due today or overdue
    const tasksDue = tasksDueToday.filter((t) => !t.is_completed).length;

    return NextResponse.json({
      habits_incomplete: habitsIncomplete,
      tasks_due: tasksDue,
    });
  } catch (error) {
    log.error("GET /api/sidebar/counts error", error);
    return NextResponse.json(
      { error: "Failed to fetch sidebar counts" },
      { status: 500 }
    );
  }
}
