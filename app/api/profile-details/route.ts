import { NextResponse } from "next/server";
import { ProfilesDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import { profileDetailsCommandSchema } from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function PATCH(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "profile_details_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        profileDetailsCommandSchema,
      );
      if (!validation.success) return validation.response;

      const result = await new ProfilesDB(auth.client).updateProfileDetails(
        validation.data,
      );
      return NextResponse.json(result);
    },
  );
}
