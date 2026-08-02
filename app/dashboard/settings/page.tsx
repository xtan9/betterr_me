import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CurrentProfileDB } from "@/lib/db/current-profile";
import { SettingsContent } from "@/components/settings/settings-content";
import { composeCurrentProfileResponse } from "@/lib/current-profile";
import {
  authenticatedCookiePermissions,
  verifiedIdentityEmail,
} from "@/lib/auth/authenticated-request";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const currentProfileDB = new CurrentProfileDB(supabase);
  const projection = await currentProfileDB.getCurrentProfileProjection(user.id);
  const permissions = await authenticatedCookiePermissions(supabase, user.id);
  const initialData = projection
    ? composeCurrentProfileResponse({
        identityEmail: verifiedIdentityEmail(user),
        capabilities: {
          canAccessAdmin: permissions.some((permission) => permission === "admin"),
        },
        projection,
      })
    : undefined;

  return (
    <SettingsContent
      initialData={initialData}
      initialSubject={user.id}
    />
  );
}
