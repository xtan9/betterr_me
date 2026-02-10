import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfilesDB } from "@/lib/db";
import { SettingsContent } from "@/components/settings/settings-content";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profilesDB = new ProfilesDB(supabase);
  const profile = await profilesDB.getProfile(user.id);

  return (
    <SettingsContent
      initialProfile={profile ? { profile } : undefined}
    />
  );
}
