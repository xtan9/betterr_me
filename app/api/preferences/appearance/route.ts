import { NextResponse } from "next/server";
import { AppearanceDB } from "@/lib/db/appearance";
import { validateRequestBody } from "@/lib/validations/api";
import {
  appearancePreferenceIntentSchema,
} from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function POST(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "appearance_preference_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        appearancePreferenceIntentSchema,
      );
      if (!validation.success) return validation.response;

      const result = await new AppearanceDB(auth.client).setAppearancePreference(
        validation.data.theme,
      );
      return NextResponse.json(result);
    },
  );
}
