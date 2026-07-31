import { NextResponse } from 'next/server';

import { getOAuthIssuer } from '@/lib/oauth/access-token';

export async function GET() {
  const baseUrl = getOAuthIssuer();
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    token_endpoint_auth_methods_supported: ['none'],
  });
}
