import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ProfilesDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import {
  createLegacyRouteTelemetry,
  legacyAuthErrorCode,
  legacyFailureCode,
} from "@/lib/legacy-telemetry";
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
  const telemetry = createLegacyRouteTelemetry("/api/profile", "profile");
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      telemetry.setErrorCode(legacyAuthErrorCode(auth.outcome));
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(userId);

    if (!profile) {
      telemetry.setErrorCode("profile_not_found");
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    telemetry.setRevision(profile.preference_revision);
    return NextResponse.json({ profile });
  } catch (error) {
    telemetry.setErrorCode(legacyFailureCode(error, "profile_read_failed"));
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  } finally {
    telemetry.emit();
  }
}

/**
 * PATCH /api/profile
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  const telemetry = createLegacyRouteTelemetry("/api/profile", "profile");
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      telemetry.setErrorCode(legacyAuthErrorCode(auth.outcome));
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, profileUpdateSchema);
    if (!validation.success) {
      telemetry.setErrorCode("invalid_request");
      return validation.response;
    }

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

    telemetry.setRevision(profile.preference_revision);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const code = legacyFailureCode(error, "profile_write_failed");
    telemetry.setErrorCode(code);
    if (code === "profile_not_found") {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  } finally {
    telemetry.emit();
  }
}
