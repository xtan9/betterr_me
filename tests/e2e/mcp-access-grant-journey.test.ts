// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  assertExactCanonicalResource,
  buildLoopbackUrls,
  buildPublicNativeClientMetadata,
  buildRegistrationNegativeCases,
  grantClientId,
  LOOPBACK_HOSTS,
  s256CodeChallenge,
} from "../../e2e/mcp-access-grant-journey";
import { MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG } from "../../e2e/mcp-access-grant-catalogs";

describe("MCP access-grant adapter-safe journey mechanics", () => {
  it("constructs host/path-only loopback registration and request-time callback URLs", () => {
    expect(LOOPBACK_HOSTS).toEqual(["127.0.0.1", "::1"]);
    expect(buildLoopbackUrls("127.0.0.1", 43127)).toEqual({
      registrationUrl: "http://127.0.0.1/oauth/callback",
      callbackUrl: "http://127.0.0.1:43127/oauth/callback",
    });
    expect(buildLoopbackUrls("::1", 43128)).toEqual({
      registrationUrl: "http://[::1]/oauth/callback",
      callbackUrl: "http://[::1]:43128/oauth/callback",
    });
  });

  it("constructs public-native registration metadata and catalog-bound negative probes", () => {
    const metadata = buildPublicNativeClientMetadata({
      registrationRedirectUri: "http://127.0.0.1/oauth/callback",
      clientName: "MCP Compatibility Client",
      clientUri: "https://mcp-client.example.test/about",
      logoUri: "https://mcp-client.example.test/logo.svg",
      softwareId: "mcp-compatibility-client",
      softwareVersion: "1.0.0",
    });

    expect(metadata).toEqual({
      client_name: "MCP Compatibility Client",
      client_uri: "https://mcp-client.example.test/about",
      logo_uri: "https://mcp-client.example.test/logo.svg",
      redirect_uris: ["http://127.0.0.1/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      software_id: "mcp-compatibility-client",
      software_version: "1.0.0",
    });

    const negativeCases = buildRegistrationNegativeCases(metadata);
    const catalogNegativeKeys = Object.keys(MCP_ACCESS_GRANT_REQUEST_RECIPE_CATALOG)
      .filter((key) => key.startsWith("public.registration.negative."));

    expect(negativeCases.map(({ id }) => `public.registration.negative.${id}`)).toEqual(catalogNegativeKeys);
    expect(negativeCases.map(({ id }) => id)).toEqual([
      "unsupported-client-auth-method",
      "unsupported-grant-type",
      "unsupported-response-type",
      "malformed-metadata",
      "unsafe-redirect-metadata",
    ]);
    expect(negativeCases.map(({ metadata: caseMetadata }) => caseMetadata)).toEqual([
      { ...metadata, token_endpoint_auth_method: "client_secret_post" },
      { ...metadata, grant_types: ["client_credentials"] },
      { ...metadata, response_types: ["token"] },
      { ...metadata, redirect_uris: ["not-a-loopback-uri"] },
      { ...metadata, redirect_uris: ["https://untrusted-client.example.test/callback"] },
    ]);
  });

  it("constructs outbound S256 challenges and extracts provider grant client identities", () => {
    expect(s256CodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(grantClientId({ client_id: "direct-client" })).toBe("direct-client");
    expect(grantClientId({ client: { id: "nested-client" } })).toBe("nested-client");
    expect(grantClientId({ client: { client_id: "nested-client-id" } })).toBe("nested-client-id");
    expect(grantClientId({ client: { name: "missing-id" } })).toBeUndefined();
  });

  it("guards the operational canonical resource by rejecting unsafe SDK requests", () => {
    expect(assertExactCanonicalResource("https://mcp.example.test/mcp", "https://mcp.example.test/mcp"))
      .toBeUndefined();
    expect(() => assertExactCanonicalResource("https://mcp.example.test/mcp", undefined))
      .toThrow("OAuth resource must equal the configured Canonical MCP Resource");
    expect(() => assertExactCanonicalResource("https://mcp.example.test/mcp", "https://other.example.test/mcp"))
      .toThrow("OAuth resource must equal the configured Canonical MCP Resource");
  });
});
