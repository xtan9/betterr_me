import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ProfilesDB, InsightsDB } from "@/lib/db";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        {
          error:
            auth.status === 500
              ? "Authentication service error"
              : cookieRouteErrorMessage(auth),
        },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || undefined;

    const profilesDB = new ProfilesDB(supabase);
    const weekStartDay = (await profilesDB.getWeekStartPreference(userId)) ?? 1;

    const insightsDB = new InsightsDB(supabase);
    const insights = await insightsDB.getWeeklyInsights(
      userId,
      weekStartDay,
      date,
    );

    return NextResponse.json({ insights });
  } catch (error) {
    log.error("GET /api/insights/weekly error", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly insights" },
      { status: 500 },
    );
  }
}
