import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HabitsPageContent } from "@/components/habits/habits-page-content";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <HabitsPageContent />;
}
