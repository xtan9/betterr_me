import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { ProfilesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import {
  createLegacyRouteTelemetry,
  legacyAuthErrorCode,
  legacyFailureCode,
} from '@/lib/legacy-telemetry';
import { preferencesSchema } from '@/lib/validations/preferences';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * PATCH /api/profile/preferences
 * Update user preferences (merges with existing)
 */
export async function PATCH(request: NextRequest) {
  const telemetry = createLegacyRouteTelemetry(
    "/api/profile/preferences",
    "preferences",
  );
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
    const validation = validateRequestBody(body, preferencesSchema);
    if (!validation.success) {
      telemetry.setErrorCode("invalid_request");
      return validation.response;
    }

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.updatePreferences(userId, validation.data);

    telemetry.setRevision(profile.preference_revision);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const code = legacyFailureCode(error, 'preference_write_failed');
    telemetry.setErrorCode(code);
    if (code === 'profile_not_found') {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  } finally {
    telemetry.emit();
  }
}
