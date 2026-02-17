import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HabitsDB, TasksDB } from "@/lib/db";
import { getLocalDateString } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const habitsDB = new HabitsDB(supabase);
    const tasksDB = new TasksDB(supabase);

    // Accept date from query param (client sends local date)
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || getLocalDateString();

    // Run both queries in parallel
    const [habitsWithStatus, tasksDueToday] = await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id, date),
    ]);

    // Count incomplete habits (active habits not completed today)
    const habitsIncomplete = habitsWithStatus.filter(
      (h) => !h.completed_today
    ).length;

    // Tasks due = incomplete tasks due today or overdue (getTodayTasks already filters this)
    const tasksDue = tasksDueToday.length;

    return NextResponse.json({
      habits_incomplete: habitsIncomplete,
      tasks_due: tasksDue,
    });
  } catch (error) {
    console.error("GET /api/sidebar/counts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sidebar counts" },
      { status: 500 }
    );
  }
}
