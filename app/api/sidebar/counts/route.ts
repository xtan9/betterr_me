import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { getLocalDateString } from "@/lib/utils";
import { log } from "@/lib/logger";
import { createSupabaseSidebarCountsQuery } from "@/lib/sidebar/supabase-query";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal, client: supabase } = auth;

    // Accept date from query param (client sends local date)
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || getLocalDateString();

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const outcome = await createSupabaseSidebarCountsQuery(
      supabase,
      principal,
    ).read({ date });
    if (outcome.status === "failed") {
      return NextResponse.json(
        {
          error: outcome.error.message,
          warning: outcome.warning,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(outcome.counts);
  } catch (error) {
    log.error("GET /api/sidebar/counts error", error);
    return NextResponse.json(
      { error: "Failed to fetch sidebar counts" },
      { status: 500 }
    );
  }
}
