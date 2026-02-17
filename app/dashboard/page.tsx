import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { HabitsDB, TasksDB, HabitMilestonesDB } from "@/lib/db";
import { getLocalDateString, getNextDateString } from "@/lib/utils";
import type { DashboardData, HabitMilestone } from "@/lib/db/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const userName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";

  // Server-side data fetching — eliminates client-side waterfall
  const habitsDB = new HabitsDB(supabase);
  const tasksDB = new TasksDB(supabase);
  const milestonesDB = new HabitMilestonesDB(supabase);
  const date = getLocalDateString();

  // Server-side date — may differ from client timezone; SWR will revalidate with correct client date
  const tomorrowStr = getNextDateString(date);

  const [habitsWithStatus, todayTasks, tasksCompletedTodayCount, totalTaskCount, tasksTomorrow, milestonesToday] =
    await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      // Count completed tasks for today (HEAD-only, no row data)
      tasksDB.getTaskCount(user.id, { due_date: date, is_completed: true }),
      // Count all tasks (HEAD-only, no row data)
      tasksDB.getTaskCount(user.id),
      // Get incomplete tasks for tomorrow (rows needed for rendering)
      tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
      milestonesDB.getTodaysMilestones(user.id, date).catch((err) => {
        console.error("Failed to fetch milestones:", err);
        return [] as HabitMilestone[];
      }),
    ]);

  const completedHabitsToday = habitsWithStatus.filter(
    (h) => h.completed_today
  ).length;
  const bestStreak = habitsWithStatus.reduce(
    (max, h) => Math.max(max, h.current_streak),
    0
  );
  // Server-side render doesn't have log data to compute absence;
  // SWR will revalidate with the real values from the API route.
  const habitsWithAbsence = habitsWithStatus.map(h => ({
    ...h,
    missed_scheduled_days: 0,
    previous_streak: 0,
  }));

  const initialData: DashboardData = {
    habits: habitsWithAbsence,
    tasks_today: todayTasks,
    tasks_tomorrow: tasksTomorrow,
    milestones_today: milestonesToday,
    stats: {
      total_habits: habitsWithStatus.length,
      completed_today: completedHabitsToday,
      current_best_streak: bestStreak,
      total_tasks: totalTaskCount,
      tasks_due_today: todayTasks.length,
      tasks_completed_today: tasksCompletedTodayCount,
    },
  };

  return <DashboardContent userName={userName} initialData={initialData} />;
}
