import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

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
  const avatarUrl = user?.user_metadata?.avatar_url ?? null;

  return (
    <DashboardContent
      userName={userName}
      avatarUrl={avatarUrl}
    />
  );
}
