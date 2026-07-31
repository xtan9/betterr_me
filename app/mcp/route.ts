import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { authenticateRequest } from "@/lib/auth/authenticated-request";
import {
  sanitizedAuthFailureContext,
  type AuthenticatedRequestPolicy,
  type AuthenticatedRequestError,
} from "@/lib/auth/request-context";
import { log } from "@/lib/logger";
import { registerTools } from "@/lib/mcp/tools";

const MCP_REQUEST_POLICY = {
  allowedCredentials: ["mcp"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    capabilities: {
      tools: {},
    },
  },
  {
    streamableHttpEndpoint: "/mcp",
    maxDuration: 60,
  },
);

const policyFailures = new WeakMap<Request, AuthenticatedRequestError>();

const authHandler = withMcpAuth(handler, async (request, bearerToken) => {
  const headers = new Headers(request.headers);
  if (bearerToken) headers.set("authorization", `Bearer ${bearerToken}`);
  const credentialRequest = new Request(request.url, {
    method: request.method,
    headers,
  });
  let context;
  try {
    context = await authenticateRequest(
      credentialRequest,
      MCP_REQUEST_POLICY,
    );
  } catch (error) {
    log.error(
      "[mcp] Request authentication failed",
      undefined,
      sanitizedAuthFailureContext(error),
    );
    policyFailures.set(request, {
      ok: false,
      outcome: "misconfigured",
      error: "Server misconfigured",
      status: 500,
    });
    return undefined;
  }
  if (!context.ok) {
    policyFailures.set(request, context);
    return undefined;
  }
  if (!bearerToken) return undefined;

  return {
    token: bearerToken,
    scopes: [...context.permissions],
    clientId: context.principal.clientId ?? context.principal.userId,
    extra: { userId: context.principal.userId },
  };
}, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

async function policyAuthHandler(request: Request) {
  let response: Response;
  try {
    response = await authHandler(request);
  } catch (error) {
    log.error(
      "[mcp] Request handler failed",
      undefined,
      sanitizedAuthFailureContext(error),
    );
    return Response.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }
  const failure = policyFailures.get(request);
  policyFailures.delete(request);
  if (!failure) return response;

  const headers = new Headers(response.headers);
  const challenge = headers.get("WWW-Authenticate");
  if (failure.status === 401) {
    if (challenge) {
      headers.set(
        "WWW-Authenticate",
        challenge.replace(
          /error_description="[^"]*"/,
          `error_description="${failure.error}"`,
        ),
      );
    }
  } else if (failure.status === 403) {
    const resourceMetadata = new URL(
      "/.well-known/oauth-protected-resource",
      request.url,
    ).toString();
    headers.set(
      "WWW-Authenticate",
      challenge
        ? challenge
            .replace('error="invalid_token"', 'error="insufficient_scope"')
            .replace(
              /error_description="[^"]*"/,
              `error_description="${failure.error}"`,
            )
        : `Bearer error="insufficient_scope", error_description="${failure.error}", resource_metadata="${resourceMetadata}"`,
    );
  } else if (failure.status === 500) {
    headers.delete("WWW-Authenticate");
  }

  return Response.json(
    { error: failure.error },
    { status: failure.status, headers },
  );
}

// Vercel hobby plan allows up to 60s for streaming responses
export const maxDuration = 60;

export {
  policyAuthHandler as GET,
  policyAuthHandler as POST,
  policyAuthHandler as DELETE,
};
