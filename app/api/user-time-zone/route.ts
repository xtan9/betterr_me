import { NextResponse } from "next/server";
import { decodeUserTimeZone } from "@/lib/preferences/owners";
import { UserTimeZoneDB } from "@/lib/db/user-time-zone";
import { validateRequestBody } from "@/lib/validations/api";
import { userTimeZoneCommandSchema } from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function PUT(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "user_time_zone_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        userTimeZoneCommandSchema,
      );
      if (!validation.success) return validation.response;

      if (
        validation.data.timeZone !== null &&
        decodeUserTimeZone(validation.data.timeZone).status !== "resolved"
      ) {
        return NextResponse.json(
          { error: "invalid_preference" },
          { status: 400 },
        );
      }

      const result = await new UserTimeZoneDB(auth.client).setUserTimeZone(
        validation.data.timeZone,
      );
      return NextResponse.json(result);
    },
  );
}
