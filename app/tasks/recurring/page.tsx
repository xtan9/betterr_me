import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RecurringTasksPageContent } from "@/components/tasks/recurring-tasks-page-content";

export default async function RecurringTasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <RecurringTasksPageContent />;
}
