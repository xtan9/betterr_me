import { NextResponse } from "next/server";
import { NotificationsDB } from "@/lib/db/notifications";
import { validateRequestBody } from "@/lib/validations/api";
import { notificationPreferenceIntentSchema } from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function POST(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "notification_preference_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        notificationPreferenceIntentSchema,
      );
      if (!validation.success) return validation.response;

      const result = await new NotificationsDB(auth.client).setNotificationPreference(
        validation.data,
      );
      return NextResponse.json(result);
    },
  );
}
