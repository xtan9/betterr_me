import { NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ProfilesDB } from "@/lib/db";
import { composeCurrentProfile } from "@/lib/current-profile";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
  if (!auth.ok) {
    return NextResponse.json(
      { error: cookieRouteErrorMessage(auth) },
      { status: auth.status, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const profilesDB = new ProfilesDB(auth.client);
    const projection = await profilesDB.getCurrentProfileProjection(
      auth.principal.userId,
    );

    if (!projection) {
      return NextResponse.json(
        { error: "profile_not_provisioned" },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        currentProfile: composeCurrentProfile({
          identityEmail: auth.principal.profile?.email ?? null,
          capabilities: {
            canAccessAdmin: auth.permissions.includes("admin"),
          },
          projection,
        }),
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    log.error("[current-profile] GET /api/current-profile failed", error);
    return NextResponse.json(
      { error: "current_profile_unavailable" },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}
