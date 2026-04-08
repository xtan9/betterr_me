import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [mediaResult, exercisesResult, latestMediaResult] =
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

  if (mediaResult.error || exercisesResult.error || latestMediaResult.error) {
    log.error("Admin dashboard query errors", null, {
      mediaError: mediaResult.error,
      exercisesError: exercisesResult.error,
      latestMediaError: latestMediaResult.error,
    });
  }

  const lastSyncDate = latestMediaResult.data?.[0]?.updated_at ?? null;

  return (
    <AdminDashboardContent
      mediaCount={mediaResult.count ?? 0}
      totalExercises={exercisesResult.count ?? 0}
      lastSyncDate={lastSyncDate}
    />
  );
}
