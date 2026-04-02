import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CalendarEventsDB,
  TasksDB,
  HabitsDB,
  HabitLogsDB,
  RecurringBillsDB,
  WorkoutsDB,
} from "@/lib/db";
import { HouseholdsDB } from "@/lib/db/households";
import { expandEventsForRange } from "@/lib/calendar/recurrence";
import {
  aggregateEventsForFeed,
  aggregateTasksForFeed,
  aggregateHabitsForFeed,
  aggregateBillsForFeed,
  aggregateWorkoutsForFeed,
  mergeFeedItems,
} from "@/lib/calendar/feed-aggregation";
import { log } from "@/lib/logger";

/**
 * GET /api/calendar/feed?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&layers=event,task,habit,bill,workout
 *
 * Returns a unified array of CalendarFeedItem objects from all enabled domains.
 * The `layers` parameter is optional — defaults to all layers.
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

    // Parse enabled layers
    const layersParam = searchParams.get("layers");
    const validLayers = new Set(["event", "task", "habit", "bill", "workout"]);
    const enabledLayers = layersParam
      ? new Set(layersParam.split(",").filter((l) => validLayers.has(l)))
      : validLayers;

    // Fetch all domains in parallel
    const promises: Promise<unknown>[] = [];
    const resultKeys: string[] = [];

    if (enabledLayers.has("event")) {
      const eventsDB = new CalendarEventsDB(supabase);
      promises.push(eventsDB.getUserEvents(user.id, startDate, endDate));
      resultKeys.push("events");
    }

    if (enabledLayers.has("task")) {
      const tasksDB = new TasksDB(supabase);
      promises.push(tasksDB.getUserTasks(user.id, { has_due_date: true }));
      resultKeys.push("tasks");
    }

    if (enabledLayers.has("habit")) {
      const habitsDB = new HabitsDB(supabase);
      const habitLogsDB = new HabitLogsDB(supabase);
      promises.push(habitsDB.getActiveHabits(user.id));
      resultKeys.push("habits");
      promises.push(habitLogsDB.getAllUserLogs(user.id, startDate, endDate));
      resultKeys.push("habitLogs");
    }

    if (enabledLayers.has("bill")) {
      // Bills are scoped to household, not user directly
      const householdsDB = new HouseholdsDB(supabase);
      promises.push(
        householdsDB
          .resolveHousehold(user.id)
          .then((householdId) => {
            const billsDB = new RecurringBillsDB(supabase);
            return billsDB.getByHousehold(householdId);
          })
          .catch((err) => {
            // If household doesn't exist yet, return empty bills
            log.warn("Failed to fetch bills for calendar feed", err);
            return [];
          }),
      );
      resultKeys.push("bills");
    }

    if (enabledLayers.has("workout")) {
      const workoutsDB = new WorkoutsDB(supabase);
      promises.push(workoutsDB.getWorkouts(user.id, { limit: 100 }));
      resultKeys.push("workouts");
    }

    const results = await Promise.all(promises);

    // Map results to named data
    const data: Record<string, unknown> = {};
    resultKeys.forEach((key, i) => {
      data[key] = results[i];
    });

    // Convert each domain to feed items
    const feedArrays = [];

    if (data.events) {
      const expanded = expandEventsForRange(
        data.events as Parameters<typeof expandEventsForRange>[0],
        startDate,
        endDate,
      );
      feedArrays.push(aggregateEventsForFeed(expanded));
    }

    if (data.tasks) {
      feedArrays.push(
        aggregateTasksForFeed(
          data.tasks as Parameters<typeof aggregateTasksForFeed>[0],
          startDate,
          endDate,
        ),
      );
    }

    if (data.habits && data.habitLogs) {
      feedArrays.push(
        aggregateHabitsForFeed(
          data.habits as Parameters<typeof aggregateHabitsForFeed>[0],
          data.habitLogs as Parameters<typeof aggregateHabitsForFeed>[1],
          startDate,
          endDate,
        ),
      );
    }

    if (data.bills) {
      feedArrays.push(
        aggregateBillsForFeed(
          data.bills as Parameters<typeof aggregateBillsForFeed>[0],
          startDate,
          endDate,
        ),
      );
    }

    if (data.workouts) {
      feedArrays.push(
        aggregateWorkoutsForFeed(
          data.workouts as Parameters<typeof aggregateWorkoutsForFeed>[0],
          startDate,
          endDate,
        ),
      );
    }

    const items = mergeFeedItems(...feedArrays);

    return NextResponse.json({ items });
  } catch (error) {
    log.error("GET /api/calendar/feed error", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar feed" },
      { status: 500 },
    );
  }
}
