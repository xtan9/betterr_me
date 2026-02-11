import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { HabitsDB, TasksDB, HabitMilestonesDB } from "@/lib/db";
import { getLocalDateString, getNextDateString } from "@/lib/utils";
import type { DashboardData } from "@/lib/db/types";

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

  const [habitsWithStatus, todayTasks, allTodayTasks, allTasks, tasksTomorrow, milestonesToday] =
    await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      tasksDB.getUserTasks(user.id, { due_date: date }),
      tasksDB.getUserTasks(user.id),
      tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
      milestonesDB.getTodaysMilestones(user.id, date),
    ]);

  const completedHabitsToday = habitsWithStatus.filter(
    (h) => h.completed_today
  ).length;
  const bestStreak = habitsWithStatus.reduce(
    (max, h) => Math.max(max, h.current_streak),
    0
  );
  const tasksCompletedToday = allTodayTasks.filter(
    (t) => t.is_completed
  ).length;

  const initialData: DashboardData = {
    habits: habitsWithStatus,
    tasks_today: todayTasks,
    tasks_tomorrow: tasksTomorrow,
    milestones_today: milestonesToday,
    stats: {
      total_habits: habitsWithStatus.length,
      completed_today: completedHabitsToday,
      current_best_streak: bestStreak,
      total_tasks: allTasks.length,
      tasks_due_today: todayTasks.length,
      tasks_completed_today: tasksCompletedToday,
    },
  };

  return <DashboardContent userName={userName} initialData={initialData} />;
}
