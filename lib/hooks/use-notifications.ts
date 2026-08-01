"use client";

import type { UseCurrentProfileOptions } from "@/lib/hooks/use-current-profile";
import { useNotificationPreferences } from "@/lib/hooks/use-profile-preferences";
import { DEFAULT_REMINDER_EMAIL_PREFERENCE } from "@/lib/preferences/owners";

export function useNotifications(options?: UseCurrentProfileOptions) {
  const preference = useNotificationPreferences(options);
  const reminderEmailPreference = preference.reminderEmail;
  const reminderEmail =
    reminderEmailPreference.status === "ready" ||
    reminderEmailPreference.status === "pending"
      ? reminderEmailPreference.value
      : DEFAULT_REMINDER_EMAIL_PREFERENCE;

  return {
    ...preference,
    reminderEmail,
    reminderEmailPreference,
    acceptedReminderEmail:
      preference.currentProfile?.preferences.notifications.reminderEmail,
  };
}
