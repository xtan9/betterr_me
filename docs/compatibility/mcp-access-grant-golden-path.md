# MCP Access Grant compatibility evidence

Issue: [#766](https://github.com/xtan9/betterr_me/issues/766)

This document describes the single parameterized black-box seam, extended from
the #764 compatibility harness, used to probe a nonproduction BetterR.Me MCP
resource backed by a delegated Supabase OAuth provider. The probe is
evidence-only: it does not add a BetterR.Me OAuth fallback, change production
routing, or promote a provider configuration.

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
6. Negative PKCE proof at the public authorization and token boundaries:
   missing challenge, `plain`, missing verifier, and wrong verifier must be
   rejected without usable credentials.
7. Exact Canonical MCP Resource propagation through discovery, authorization,
   token, and MCP operation, plus rejection of missing, generic, inferred, and
   unrelated resource/audience values.
8. Local verification of the provider-issued access token through an asymmetric
   JWKS: allowed algorithm, matching `kid`/key, exact issuer, non-empty subject,
   exact Canonical Resource audience, time bounds, and registered client/grant
   context. No provider validation round trip is used.
9. Negative delegated-token cases at the public MCP boundary: invalid
   signature, algorithm, key, issuer, subject/audience, time, and client/grant
   context must be rejected without credentials.
10. A real authenticated MCP `listTools` plus `callTool` operation using the
    official SDK client.
11. Reproducible nonproduction configuration and environment-only credentials.
12. Sanitized evidence.
13. Exact relevant SDK, Supabase, Playwright, MCP handler, CLI, and provider
    versions.

The test itself remains green when the evidence outcome is `blocked` or
`not-proven`; those outcomes are the intended compatibility-spike result when a
provider gate is conclusively unavailable or credentials are not configured.
Every downstream gate is recorded rather than silently skipped.

## Evidence recorded for the bounded run

The most recent local run on 2026-08-02 used `http://127.0.0.1:3000/mcp` as the
Canonical Resource and `http://127.0.0.1:54321/auth/v1` as the expected
delegated issuer. The sanitized matrix was:

| Gate | Result | Evidence |
| --- | --- | --- |
| Reproducible nonproduction configuration | pass | Loopback target; credentials read only from environment variables |
| Exact versions | pass | SDK `1.28.0`, Supabase client `2.95.2`, Playwright `1.58.1`, `mcp-handler` `1.1.0`, Supabase CLI `2.109.1`, GoTrue `ghcr.io/supabase/gotrue:v2.192.0` |
| Canonical Resource / PRM delegation | fail | The configured MCP origin was unreachable; the official SDK could not prove Protected Resource Metadata for the exact Canonical Resource |
| Supabase provider discovery | fail | HTTP `404`, `error_code=feature_disabled`, `OAuth server is disabled` |
| Public registration, browser consent, loopback/S256 PKCE exchange, PKCE/resource negatives, local JWKS validation, delegated-token negatives, real MCP operation | not-proven | Downstream gates were not attempted after the conclusive resource/provider failures |
| Sanitized evidence | pass | No passwords, codes, PKCE verifiers, bearer/refresh tokens, cookies, service-role keys, or reusable credentials in the artifact |

The provider failure is a bounded compatibility outcome: downstream gates
remain `not-proven`, and the implementation makes no custom fallback or
production cutover. When the provider reaches the browser and token stages, the
same report records each negative proof case and local JWT decision at the
public boundary. Relevant exact versions are captured by each run rather than
inferred from source.

Official protocol and provider references used by the harness:

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Supabase OAuth server getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
