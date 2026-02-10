import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HabitsPageContent } from "@/components/habits/habits-page-content";
import { HabitsDB } from "@/lib/db";
import { getLocalDateString } from "@/lib/utils";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const habitsDB = new HabitsDB(supabase);
  const date = getLocalDateString();
  const initialHabits = await habitsDB.getHabitsWithTodayStatus(user.id, date);

  return <HabitsPageContent initialHabits={initialHabits} />;
}
