import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { JournalPageContent } from "./journal-page-content";

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <JournalPageContent />;
}
