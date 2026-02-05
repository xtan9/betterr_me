import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateHabitContent } from "@/components/habits/create-habit-content";

export default async function CreateHabitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <CreateHabitContent />;
}
