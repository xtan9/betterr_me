import { describe, expect, it } from "vitest";

import {
  isSupportedLoopbackRegistrationRedirect,
  validatePublicClientProfile,
} from "@/e2e/mcp-access-grant-policy";
import {
  LOOPBACK_HOSTS,
  buildLoopbackUrls,
  buildPublicNativeClientMetadata,
  buildRegistrationNegativeCases,
  grantClientId,
} from "@/e2e/mcp-access-grant-journey";
import {
  browserUrlCredentialEvidence,
  classifyAuthorizationOutcome,
  classifyConsentPresentation,
  classifyPublicRegistrationBoundary,
  classifyRegistrationProbe,
  hasUnnegatedEndorsementLanguage,
  isEvidenceSanitized,
} from "@/e2e/mcp-access-grant-evidence";

describe("MCP Access Grant public-client boundary contracts", () => {
  it("keeps both loopback families on the registered host and callback path while varying only the request port", () => {
    expect(LOOPBACK_HOSTS).toEqual(["127.0.0.1", "::1"]);

    expect(buildLoopbackUrls("127.0.0.1", 43127)).toEqual({
      registrationUrl: "http://127.0.0.1/oauth/callback",
      callbackUrl: "http://127.0.0.1:43127/oauth/callback",
    });
    expect(buildLoopbackUrls("::1", 43128)).toEqual({
      registrationUrl: "http://[::1]/oauth/callback",
      callbackUrl: "http://[::1]:43128/oauth/callback",
    });

    expect(isSupportedLoopbackRegistrationRedirect("http://127.0.0.1/oauth/callback", "127.0.0.1")).toBe(true);
    expect(isSupportedLoopbackRegistrationRedirect("http://127.0.0.1:43127/oauth/callback", "127.0.0.1")).toBe(false);
    expect(isSupportedLoopbackRegistrationRedirect("http://127.0.0.1:80/oauth/callback", "127.0.0.1")).toBe(false);
    expect(isSupportedLoopbackRegistrationRedirect("https://127.0.0.1/oauth/callback", "127.0.0.1")).toBe(false);
    expect(isSupportedLoopbackRegistrationRedirect("http://[::1]/oauth/callback", "::1")).toBe(true);
    expect(isSupportedLoopbackRegistrationRedirect("http://[::1]:43128/oauth/callback", "::1")).toBe(false);
    expect(isSupportedLoopbackRegistrationRedirect("http://evil.example/oauth/callback", "127.0.0.1")).toBe(false);
  });

  it("builds the supported native public-client profile with untrusted display claims", () => {
    const metadata = buildPublicNativeClientMetadata({
      registrationRedirectUri: "http://127.0.0.1/oauth/callback",
      clientName: "MCP Compatibility Client",
      clientUri: "https://mcp-client.example.test/about",
      logoUri: "https://mcp-client.example.test/logo.svg",
      softwareId: "mcp-compatibility-client",
      softwareVersion: "1.0.0",
    });

    expect(metadata).toMatchObject({
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
    expect("client_secret" in metadata).toBe(false);
  });

  it("accepts only the returned public native registration profile", () => {
    const valid = {
      client_id: "registered-client",
      redirect_uris: ["http://127.0.0.1/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };

    expect(validatePublicClientProfile(valid, "127.0.0.1")).toEqual({
      accepted: true,
      clientIdPresent: true,
      clientSecretReturned: false,
      supportedRedirects: true,
      supportedGrantTypes: true,
      supportedResponseTypes: true,
      publicTokenAuthentication: true,
    });
    expect(validatePublicClientProfile({ ...valid, client_secret: "unexpected" }, "127.0.0.1").accepted).toBe(false);
    expect(validatePublicClientProfile({ ...valid, grant_types: ["client_credentials"] }, "127.0.0.1").accepted).toBe(false);
    expect(validatePublicClientProfile({ ...valid, response_types: ["token"] }, "127.0.0.1").accepted).toBe(false);
    expect(validatePublicClientProfile({ ...valid, token_endpoint_auth_method: "client_secret_post" }, "127.0.0.1").accepted).toBe(false);
    expect(validatePublicClientProfile({ ...valid, redirect_uris: ["https://evil.example/callback"] }, "127.0.0.1").accepted).toBe(false);
  });

  it("keeps every registration negative probe on the discovered public boundary", () => {
    const metadata = buildPublicNativeClientMetadata({
      registrationRedirectUri: "http://[::1]/oauth/callback",
      clientName: "MCP Compatibility Client",
      clientUri: "https://mcp-client.example.test/about",
      logoUri: "https://mcp-client.example.test/logo.svg",
      softwareId: "mcp-compatibility-client",
      softwareVersion: "1.0.0",
    });

    const negatives = buildRegistrationNegativeCases(metadata);
    expect(negatives.map(({ id }) => id)).toEqual([
      "unsupported-client-auth-method",
      "unsupported-grant-type",
      "unsupported-response-type",
      "malformed-metadata",
      "unsafe-redirect-metadata",
    ]);
    expect(negatives[0].metadata.token_endpoint_auth_method).toBe("client_secret_post");
    expect(negatives[1].metadata.grant_types).toEqual(["client_credentials"]);
    expect(negatives[2].metadata.response_types).toEqual(["token"]);
    expect(negatives[3].metadata.redirect_uris).toEqual(["not-a-loopback-uri"]);
    expect(negatives[4].metadata.redirect_uris).toEqual(["https://untrusted-client.example.test/callback"]);
  });

  it("does not turn unavailable registration responses into validation passes", () => {
    expect(classifyRegistrationProbe(201, "unavailable")).toBe("accepted");
    expect(classifyRegistrationProbe(400, "invalid_client_metadata")).toBe("rejected");
    expect(classifyRegistrationProbe(422, "invalid_client_metadata")).toBe("rejected");
    expect(classifyRegistrationProbe(400, "unavailable")).toBe("not-proven");
    expect(classifyRegistrationProbe(400, "feature_disabled")).toBe("not-proven");
    expect(classifyRegistrationProbe(404, "not_found")).toBe("not-proven");
    expect(classifyRegistrationProbe(503, "temporarily_unavailable")).toBe("not-proven");
  });

  it("keeps unavailable valid-client registration distinct from an observed rejection", () => {
    expect(classifyPublicRegistrationBoundary(true, true, 201, undefined)).toBe("pass");
    expect(classifyPublicRegistrationBoundary(true, false, 400, undefined)).toBe("fail");
    expect(classifyPublicRegistrationBoundary(true, false, 503, undefined)).toBe("not-proven");
    expect(classifyPublicRegistrationBoundary(false, false, undefined, "connect ECONNREFUSED")).toBe("not-proven");
  });

  it("evaluates endorsement negation per statement", () => {
    expect(hasUnnegatedEndorsementLanguage("Not verified by BetterR.Me. This is an official partner.")).toBe(true);
    expect(hasUnnegatedEndorsementLanguage("Not verified by BetterR.Me. This is not an official partner.")).toBe(false);
    expect(hasUnnegatedEndorsementLanguage("Not verified by BetterR.Me, but this client is an official partner.")).toBe(true);
  });

  it("treats browser URL fragments as credential evidence", () => {
    expect(browserUrlCredentialEvidence("http://127.0.0.1:43127/oauth/callback#error=access_denied")).toMatchObject({
      credentialObserved: false,
      fragmentKeys: [],
    });
    expect(browserUrlCredentialEvidence("http://127.0.0.1:43127/oauth/callback?error=access_denied#access_token=live-token")).toMatchObject({
      credentialObserved: true,
      accessTokenPresent: true,
      fragmentKeys: ["access_token"],
    });
  });

  it("uses the official Supabase OAuth grant client identifier shape", () => {
    expect(grantClientId({ client: { id: "registered-client", name: "MCP Compatibility Client" } })).toBe("registered-client");
  });

  it("requires visible untrusted treatment and a distinct affirmative consent decision", () => {
    expect(classifyConsentPresentation({
      clientNameVisible: true,
      clientUriVisible: true,
      logoVisible: true,
      softwareIdVisible: true,
      softwareVersionVisible: true,
      untrustedDisclaimerVisible: true,
      endorsementLanguageVisible: false,
      affirmativeControlVisible: true,
      denialControlVisible: true,
      callbackBeforeDecision: false,
    })).toBe("pass");

    expect(classifyConsentPresentation({
      clientNameVisible: true,
      clientUriVisible: true,
      logoVisible: true,
      softwareIdVisible: true,
      softwareVersionVisible: true,
      untrustedDisclaimerVisible: false,
      endorsementLanguageVisible: false,
      affirmativeControlVisible: true,
      denialControlVisible: true,
      callbackBeforeDecision: false,
    })).toBe("fail");
    expect(classifyConsentPresentation({
      clientNameVisible: true,
      clientUriVisible: true,
      logoVisible: true,
      softwareIdVisible: false,
      softwareVersionVisible: true,
      untrustedDisclaimerVisible: true,
      endorsementLanguageVisible: false,
      affirmativeControlVisible: true,
      denialControlVisible: true,
      callbackBeforeDecision: false,
    })).toBe("fail");
    expect(classifyConsentPresentation({
      clientNameVisible: true,
      clientUriVisible: true,
      logoVisible: true,
      softwareIdVisible: true,
      softwareVersionVisible: true,
      untrustedDisclaimerVisible: true,
      endorsementLanguageVisible: true,
      affirmativeControlVisible: true,
      denialControlVisible: true,
      callbackBeforeDecision: false,
    })).toBe("fail");
  });

  it("passes denial only when the provider returns an OAuth error without credentials", () => {
    expect(classifyAuthorizationOutcome({
      kind: "denial",
      callbackReceived: true,
      authorizationError: true,
      stateMatches: true,
      authorizationCodePresent: false,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
    })).toBe("pass");
    expect(classifyAuthorizationOutcome({
      kind: "denial",
      callbackReceived: true,
      authorizationError: true,
      stateMatches: true,
      authorizationCodePresent: true,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
    })).toBe("fail");
    expect(classifyAuthorizationOutcome({
      kind: "denial",
      callbackReceived: true,
      authorizationError: true,
      stateMatches: true,
      authorizationCodePresent: false,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
      idTokenObserved: true,
    })).toBe("fail");
  });

  it("passes abandonment only when no callback or credentials appear", () => {
    expect(classifyAuthorizationOutcome({
      kind: "abandonment",
      callbackReceived: false,
      authorizationError: false,
      authorizationCodePresent: false,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
    })).toBe("pass");
    expect(classifyAuthorizationOutcome({
      kind: "denial",
      callbackReceived: true,
      authorizationError: true,
      stateMatches: false,
      authorizationCodePresent: false,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
    })).toBe("fail");
    expect(classifyAuthorizationOutcome({
      kind: "abandonment",
      callbackReceived: true,
      authorizationError: false,
      authorizationCodePresent: false,
      tokenRequestObserved: false,
      accessTokenObserved: false,
      refreshTokenObserved: false,
    })).toBe("fail");
  });

  it("detects reusable credentials in evidence even when they are not JWTs", () => {
    expect(isEvidenceSanitized('{"access_token":"[REDACTED]","password":"[REDACTED]"}', ["secret-password"])).toBe(true);
    expect(isEvidenceSanitized('{"access_token":"live-access-token"}', ["secret-password"])).toBe(false);
    expect(isEvidenceSanitized('{"detail":"secret-password"}', ["secret-password"])).toBe(false);
    expect(isEvidenceSanitized('{"authorization":"Bearer live-token"}', [])).toBe(false);
    expect(isEvidenceSanitized('{"error_code":"feature_disabled"}', [])).toBe(true);
  });
});
