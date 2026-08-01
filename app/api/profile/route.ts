import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ProfilesDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";
import { profileUpdateSchema } from "@/lib/validations/profile";
import type { Profile, ProfileUpdate } from "@/lib/db/types";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/profile
 * Get current user's profile
 */
export async function GET(request: Request) {
  log.info("[legacy-profile] compatibility traffic", {
    route: "/api/profile",
    method: "GET",
  });
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(userId);

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    log.error("GET /api/profile error", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  log.info("[legacy-profile] compatibility traffic", {
    route: "/api/profile",
    method: "PATCH",
  });
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, profileUpdateSchema);
    if (!validation.success) return validation.response;

    // Build update object from validated data
    const updates: ProfileUpdate = {};

    if (validation.data.full_name !== undefined) {
      updates.full_name = validation.data.full_name?.trim() || null;
    }

    if (validation.data.avatar_url !== undefined) {
      updates.avatar_url = validation.data.avatar_url?.trim() || null;
    }

    if (validation.data.timezone !== undefined) {
      updates.timezone = validation.data.timezone?.trim() || null;
    }

    const profilesDB = new ProfilesDB(supabase);
    const profile: Profile = await profilesDB.updateProfile(userId, updates);

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    log.error("PATCH /api/profile error", error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
