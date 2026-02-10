import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { HabitsDB, TasksDB } from "@/lib/db";
import { getLocalDateString } from "@/lib/utils";
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
  const date = getLocalDateString();

  // Derive tomorrow from the client-sent date (timezone safety)
  const [year, month, day] = date.split('-').map(Number);
  const tomorrowDate = new Date(year, month - 1, day + 1);
  const tomorrowStr = [
    tomorrowDate.getFullYear(),
    String(tomorrowDate.getMonth() + 1).padStart(2, '0'),
    String(tomorrowDate.getDate()).padStart(2, '0'),
  ].join('-');

  const [habitsWithStatus, todayTasks, allTodayTasks, allTasks, tasksTomorrow] =
    await Promise.all([
      habitsDB.getHabitsWithTodayStatus(user.id, date),
      tasksDB.getTodayTasks(user.id),
      tasksDB.getUserTasks(user.id, { due_date: date }),
      tasksDB.getUserTasks(user.id),
      tasksDB.getUserTasks(user.id, { due_date: tomorrowStr, is_completed: false }),
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
