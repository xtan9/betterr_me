import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarPageContent } from "@/components/calendar/calendar-page-content";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <CalendarPageContent />;
}
