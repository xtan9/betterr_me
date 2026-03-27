import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/oauth/register — OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * MCP clients (like Claude Code) call this to register themselves before
 * starting the OAuth flow. Since we're a public client app (no secrets),
 * we accept any registration and return a generated client_id.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const clientId = crypto.randomUUID();

    return NextResponse.json(
      {
        client_id: clientId,
        client_name: body.client_name || "MCP Client",
        redirect_uris: body.redirect_uris || [],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400 },
    );
  }
}
