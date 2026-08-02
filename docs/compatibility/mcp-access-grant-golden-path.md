# MCP Access Grant golden-path compatibility evidence

Issue: [#764](https://github.com/xtan9/betterr_me/issues/764)

This document describes the single parameterized black-box seam used to probe a
nonproduction BetterR.Me MCP resource backed by a delegated Supabase OAuth
provider. The probe is evidence-only: it does not add a BetterR.Me OAuth
fallback, change production routing, or promote a provider configuration.

## Run

Install the locked dependencies, start a dedicated nonproduction BetterR.Me
instance, and provide the test identity through the environment. The password
and all other reusable credentials must remain outside the repository.

```powershell
pnpm install --frozen-lockfile
$env:MCP_ACCESS_GRANT_BETTERRME_ORIGIN = "http://127.0.0.1:3000"
$env:MCP_ACCESS_GRANT_CANONICAL_RESOURCE = "http://127.0.0.1:3000/mcp"
$env:MCP_SUPABASE_URL = "http://127.0.0.1:54321"
$env:MCP_SUPABASE_AUTH_ISSUER = "http://127.0.0.1:54321/auth/v1"
$env:MCP_TEST_EMAIL = "<dedicated nonproduction identity>"
$env:MCP_TEST_PASSWORD = "<read from a secret store>"
pnpm test:e2e:mcp-access-grant
```

For more than one environment, set `MCP_ACCESS_GRANT_TARGETS` to a JSON array
of objects containing `name`, `canonicalResource`, `supabaseUrl`, and optionally
`expectedAuthorizationServer`, `emailEnv`, and `passwordEnv`. The last two
fields name environment variables; they do not contain credentials themselves.

The suite writes a sanitized JSON artifact named
`mcp-access-grant-evidence.json` under the Playwright test output directory. Set
`MCP_ACCESS_GRANT_EVIDENCE_PATH` to also write a copy to a specifically chosen
local path. The artifact records request methods, endpoint paths, status codes,
safe metadata fields, gate statuses, and exact installed component versions. It
does not record passwords, authorization codes, PKCE verifiers, bearer or
refresh tokens, cookies, service-role keys, or reusable client credentials.

## Gates

The suite records `pass`, `fail`, or `not-proven` for each gate:

1. Canonical Resource discovery through the official MCP SDK, including
   Protected Resource Metadata and delegated authorization-server metadata.
2. Supabase provider metadata for public dynamic registration, authorization
   code/code response, no token-endpoint client authentication, and S256 PKCE.
3. Public native client registration without a client secret.
4. Browser authentication and explicit affirmative consent with a denial option.
5. Fixed IPv4 loopback callback, state preservation, S256 PKCE, and public-client
   code exchange.
6. Local verification of the provider-issued access token through asymmetric
   JWKS, issuer, subject, Canonical Resource audience, time, and client/grant
   context checks.
7. A real authenticated MCP `listTools` plus `callTool` operation using the
   official SDK client.
8. Reproducible nonproduction configuration and environment-only credentials.
9. Sanitized evidence.
10. Exact relevant SDK, Supabase, Playwright, MCP handler, CLI, and provider
    versions.

The test itself remains green when the evidence outcome is `blocked` or
`not-proven`; those outcomes are the intended compatibility-spike result when a
provider gate is conclusively unavailable or credentials are not configured.
Every downstream gate is recorded rather than silently skipped.

## Evidence recorded for this implementation

The local run on 2026-08-02 used `http://127.0.0.1:3000/mcp` as the Canonical
Resource and `http://127.0.0.1:54321/auth/v1` as the expected delegated issuer.
The sanitized matrix was:

| Gate | Result | Evidence |
| --- | --- | --- |
| Reproducible nonproduction configuration | pass | Loopback target; credentials read only from environment variables |
| Exact versions | pass | SDK `1.28.0`, Supabase client `2.95.2`, Playwright `1.58.1`, `mcp-handler` `1.1.0`, Supabase CLI `2.109.1`, GoTrue `ghcr.io/supabase/gotrue:v2.192.0` |
| Canonical Resource / PRM delegation | fail | Local PRM advertised resource `http://127.0.0.1:3000/` and authorization server `https://betterr.me`, not the configured Supabase issuer |
| Supabase provider discovery | fail | HTTP `404`, `error_code=feature_disabled`, `OAuth server is disabled` |
| Public registration, browser consent, loopback/PKCE exchange, local JWKS validation, real MCP operation | not-proven | Downstream gates were not attempted after the conclusive provider/delegation failures |
| Sanitized evidence | pass | No passwords, codes, PKCE verifiers, bearer/refresh tokens, cookies, service-role keys, or reusable credentials in the artifact |

The provider failure is the bounded spike outcome: downstream gates remain
`not-proven`, and the implementation makes no custom fallback or production
cutover. Relevant exact versions are captured by each run rather than inferred
from source.

Official protocol and provider references used by the harness:

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Supabase OAuth server getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
