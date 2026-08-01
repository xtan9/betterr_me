import { NextResponse } from "next/server";
import { LocalizationDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import { localizationPreferenceIntentSchema } from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function POST(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "localization_preference_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        localizationPreferenceIntentSchema,
      );
      if (!validation.success) return validation.response;

      const result = await new LocalizationDB(auth.client).setWeekStartPreference(
        validation.data.weekStart,
      );
      return NextResponse.json(result);
    },
  );
}
