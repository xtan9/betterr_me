import { NextResponse } from "next/server";
import { FitnessDB } from "@/lib/db/fitness";
import { validateRequestBody } from "@/lib/validations/api";
import { fitnessPreferenceIntentSchema } from "@/lib/preferences/commands";
import { readJson, runPreferenceCommand } from "@/lib/preferences/api";

export async function POST(request: Request) {
  // runPreferenceCommand applies authenticateRequest with allowedCredentials
  // and requiredPermission from PREFERENCE_WRITE_POLICY.
  return runPreferenceCommand(
    request,
    "fitness_preference_unavailable",
    async (auth) => {
      const validation = validateRequestBody(
        await readJson(request),
        fitnessPreferenceIntentSchema,
      );
      if (!validation.success) return validation.response;

      const result = await new FitnessDB(auth.client).setFitnessPreference(
        validation.data.weightUnit,
      );
      return NextResponse.json(result);
    },
  );
}
