import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfilesDB } from "@/lib/db";
import { SettingsContent } from "@/components/settings/settings-content";
import { composeCurrentProfile } from "@/lib/current-profile";
import { verifiedIdentityEmail } from "@/lib/auth/authenticated-request";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profilesDB = new ProfilesDB(supabase);
  const projection = await profilesDB.getCurrentProfileProjection(user.id);
  const initialData = projection
    ? {
        currentProfile: composeCurrentProfile({
          identityEmail: verifiedIdentityEmail(user),
          projection,
        }),
      }
    : undefined;

  return (
    <SettingsContent
      initialData={initialData}
      initialSubject={user.id}
    />
  );
}
