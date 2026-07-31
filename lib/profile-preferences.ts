import type { Profile } from "@/lib/db/types";

type EmailPreferenceProfile = Pick<
  Profile,
  "preferences" | "email_notifications_enabled"
>;

export function emailNotificationsEnabled(
  profile: EmailPreferenceProfile | null | undefined,
): boolean {
  return (
    profile?.preferences.email_notifications_enabled ??
    profile?.email_notifications_enabled ??
    false
  );
}
