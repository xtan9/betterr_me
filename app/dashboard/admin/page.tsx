import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [{ count: mediaCount }, { count: totalExercises }, { data: latestMedia }] =
    await Promise.all([
      supabase
        .from("exercise_media")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("exercises")
        .select("*", { count: "exact", head: true })
        .eq("is_custom", false),
      supabase
        .from("exercise_media")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

  const lastSyncDate = latestMedia?.[0]?.updated_at ?? null;

  return (
    <AdminDashboardContent
      mediaCount={mediaCount ?? 0}
      totalExercises={totalExercises ?? 0}
      lastSyncDate={lastSyncDate}
    />
  );
}
