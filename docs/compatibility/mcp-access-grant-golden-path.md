# MCP Access Grant compatibility evidence and ownership recommendation

Issues: [#763](https://github.com/xtan9/betterr_me/issues/763),
[#764](https://github.com/xtan9/betterr_me/issues/764),
[#765](https://github.com/xtan9/betterr_me/issues/765),
[#766](https://github.com/xtan9/betterr_me/issues/766), and
[#767](https://github.com/xtan9/betterr_me/issues/767), with the final
matrix recorded for [#768](https://github.com/xtan9/betterr_me/issues/768).

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
$env:MCP_SUPABASE_ANON_KEY = "<read from a secret store>"
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

## Issue #768 matrix run — 2026-08-02

The final run used the same Playwright/official MCP SDK contract for both
targets in one serial invocation. The following target configuration contains
only public URLs and non-secret setup; a complete browser run may add
`emailEnv` and `passwordEnv` names that point to credentials held outside the
repository.

```powershell
$env:MCP_ACCESS_GRANT_TARGETS = @'
[
  {
    "name": "local-non-production",
    "canonicalResource": "http://127.0.0.1:3000",
    "supabaseUrl": "http://127.0.0.1:54321",
    "expectedAuthorizationServer": "http://127.0.0.1:54321/auth/v1",
    "loopbackHosts": ["127.0.0.1", "::1"]
  },
  {
    "name": "deployed-non-production",
    "canonicalResource": "https://www.betterr.me",
    "supabaseUrl": "https://ugkhvvmjdrshuopgaaje.supabase.co",
    "expectedAuthorizationServer": "https://ugkhvvmjdrshuopgaaje.supabase.co/auth/v1",
    "loopbackHosts": ["127.0.0.1", "::1"]
  }
]
'@
$env:MCP_ACCESS_GRANT_NON_PRODUCTION_ACK = "true"
$env:MCP_ACCESS_GRANT_HEADLESS = "true"
pnpm test:e2e:mcp-access-grant
```

The local BetterR.Me dev server was running at port `3000` against the local
Supabase services at port `54321`. The deployed target was the non-production
BetterR.Me deployment currently served at `www.betterr.me`; no production
configuration, user, grant, client, or key was changed. Both registered
loopback families were supplied to each target. This environment did not have
a dedicated browser identity/password or provider client key, so the browser,
token, refresh, revocation, and cleanup journeys were not attempted after the
discovery blockers.

| Target | BetterR.Me base / Canonical MCP Resource | Supabase URL / issuer | PRM observed at | Delegated provider discovery | Required non-secret setup |
| --- | --- | --- | --- | --- | --- |
| Local non-production | `http://127.0.0.1:3000/` | `http://127.0.0.1:54321/` / `http://127.0.0.1:54321/auth/v1` | HTTP `200`; advertised resource `http://127.0.0.1:3000/`, authorization server `https://betterr.me/` | `http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server` → HTTP `404`, `error_code=feature_disabled`, `OAuth server is disabled` | Local dev server, local Supabase services, IPv4 + IPv6 loopback hosts |
| Deployed non-production | `https://www.betterr.me/` | `https://ugkhvvmjdrshuopgaaje.supabase.co/` / `https://ugkhvvmjdrshuopgaaje.supabase.co/auth/v1` | HTTP `200`; advertised resource `https://www.betterr.me/`, authorization server `https://www.betterr.me/` | `https://ugkhvvmjdrshuopgaaje.supabase.co/auth/v1/.well-known/oauth-authorization-server` → HTTP `404`, `error_code=feature_disabled`, `OAuth server is disabled` | Public deployed URL, dedicated non-production project reference, non-production acknowledgement, IPv4 + IPv6 loopback hosts |

Both target configurations declared the same host/path-only callback templates:
`http://127.0.0.1/oauth/callback` and
`http://[::1]/oauth/callback`. The contract would select an available port at
authorization-request time; neither request-time callback was reached after
the discovery failures. The delegated provider's authorization endpoint,
registration endpoint, token endpoint, and `jwks_uri` are all
`not-proven`/not observed because the provider discovery document returned
HTTP `404 feature_disabled`; no endpoint was guessed from documentation.

The machine-readable sanitized artifact is
[`mcp-access-grant-issue-768-evidence.json`](./mcp-access-grant-issue-768-evidence.json).
It contains the exact per-target gate IDs and statuses, request status codes,
safe metadata, and versions only. The test-run artifacts also passed the
harness sanitization check. No client or grant was created because both runs
stopped before registration; cleanup is therefore `not-proven`, not passing.

### Matrix result

| Gate family | Local | Deployed | Exact observed evidence |
| --- | --- | --- | --- |
| Reproducible non-production configuration | pass | pass | Both targets used explicit URLs, both loopback families, and environment-only credential slots; the run recorded that no provider identity/client key was configured. |
| Exact relevant versions | pass | not-proven | Local SDK `1.28.0`, Supabase client `2.95.2`, Playwright `1.58.1`, `mcp-handler` `1.1.0`, CLI `2.109.1`, and GoTrue image `ghcr.io/supabase/gotrue:v2.192.0` were captured. The hosted provider exposes no exact server version in the observed public response, so the deployed version gate is not-proven. |
| Canonical Resource / Protected Resource Metadata delegation | fail | fail | Local PRM selected `https://betterr.me/`; deployed PRM selected `https://www.betterr.me/`. Neither selected its configured Supabase issuer. This is a hard Canonical Resource failure. |
| Supabase OAuth-server discovery | fail | fail | Both configured provider discovery endpoints returned HTTP `404`, `error_code=feature_disabled`, `OAuth server is disabled`. Beta status is an operational risk; the observed disabled feature is the compatibility failure. |
| Public registration and registration-negative validation | not-proven | not-proven | IPv4 and IPv6 registration were not reached after discovery failed; no unsupported metadata response was inferred. |
| IPv4 loopback, request-time port, callback, and S256 PKCE | not-proven | not-proven | Both IPv4 journeys were stopped before registration/authorization; no callback or port result is reported as passing. |
| IPv6 loopback, request-time port, callback, and S256 PKCE | not-proven | not-proven | Both IPv6 journeys were stopped before registration/authorization; no callback or port result is reported as passing. |
| Consent, denial, and abandonment safety | not-proven | not-proven | No browser identity was configured and no provider authorization page was reached. |
| PKCE negatives and exact Resource negative cases | not-proven | not-proven | No provider authorization-code/token boundary was reached. |
| Local provider-issued JWT/JWKS validation and negative token boundary | not-proven | not-proven | No provider access token, JWKS, or delegated client/grant context was issued or observed. |
| Real authenticated MCP operation | not-proven | not-proven | No delegated access token was obtained, so `listTools`/`callTool` was not attempted. |
| Refresh rotation and replay containment | not-proven | not-proven | No provider refresh token was issued. |
| Grant identification, revocation, post-revocation access/refresh | not-proven | not-proven | No MCP Access Grant was created; no revocation behavior was inferred. |
| Cleanup | not-proven | not-proven | There was no created client/grant to revoke; the absence of cleanup work is not a cleanup pass. |
| Sanitized evidence | pass | pass | The artifact contains no password, authorization code, PKCE verifier, bearer/refresh token, cookie, service-role key, client secret, or reusable credential. |

The artifact preserves the lower-level IPv4/IPv6, aggregate, #766, and #767
gate IDs. Every such downstream gate is `not-proven` for both targets; none is
reported as passing because the discovery and provider hard gates failed first.

### Ownership recommendation

Do not commission a delegated production-cutover spec from this run. The
separately scoped custom OAuth Grant Lifecycle decision is blocked by two
precise, independently observed limitations in both environments:

1. BetterR.Me Protected Resource Metadata does not delegate the exact
   Canonical MCP Resource to the configured Supabase issuer. It advertises
   BetterR.Me itself instead.
2. The configured Supabase OAuth-server discovery endpoint returns
   `feature_disabled` / `OAuth server is disabled`, so dynamic registration,
   authorization-code issuance, token exchange, refresh rotation, and grant
   revocation cannot be proven.

Supabase would own enabling and operating the non-production OAuth server and
publishing its discovery, registration, authorization, token, JWKS, refresh,
and grant-management capabilities. BetterR.Me would own the exact Protected
Resource Metadata delegation, explicit consent/untrusted-client presentation,
local delegated-JWT policy, and MCP operation authorization. The latter
responsibilities remain architectural ownership boundaries, not demonstrated
capabilities in this run. Re-run this unchanged matrix after the provider
feature and PRM delegation are corrected; only an all-hard-gates pass in both
targets would justify a later production-cutover spec.

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

Issue #767 extends the same parameterized seam with these additional gates:

14. One successful provider refresh through the official MCP SDK, with both
    the access and refresh credentials replaced and the replacement access
    credential used for a real MCP operation.
15. Replay containment for the consumed refresh credential and every active
    descendant issued by the family; each replay attempt must be rejected.
16. User-facing grant identification through the official Supabase client and
    supported grant revocation using the registered public client identifier.
17. Post-revocation refresh rejection and post-revocation access behavior,
    including the documented access-token lifetime boundary.
18. Repeatable cleanup evidence. Dynamic public-client deregistration is not
    exposed by the supported user-facing grant API, so the harness records that
    limitation and does not emulate it with a BetterR.Me store or fallback.

The test itself remains green when the evidence outcome is `blocked` or
`not-proven`; those outcomes are the intended compatibility-spike result when a
provider gate is conclusively unavailable or credentials are not configured.
Every downstream gate is recorded rather than silently skipped.

## Prior #764–#767 local evidence

The earlier #764–#767 local run on 2026-08-02 used `http://127.0.0.1:3000/mcp` as the
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

## Refresh rotation and grant revocation evidence (#767)

The #767 extension remains a single parameterized black-box harness. It uses
`refreshAuthorization` from `@modelcontextprotocol/sdk` for every refresh
attempt, the official `Client` and `StreamableHTTPClientTransport` for the
protected-resource operation, and the official Supabase client APIs
`auth.oauth.listGrants()` and `auth.oauth.revokeGrant({ clientId })` for the
user-facing revocation seam. No provider database, BetterR.Me token-family
store, UI, or custom revocation fallback is consulted.

For each target, the run records sanitized evidence for the following sequence:

1. Refresh once and verify that the provider returned a changed access token
   and changed refresh token.
2. Use the replacement pair for a real MCP operation, then attempt the
   consumed root refresh token and each active descendant. The replay gate
   passes only when every attempt is rejected.
3. Identify the registered client in the signed-in user's grant list and
   revoke that grant through the supported user-facing API.
4. Attempt refresh with the revoked grant and use the former access token at
   the protected resource. The access result is checked against the provider's
   documented token lifetime, without recording JWT claims or token values.
5. Record cleanup and repeatability. A run is `pass` only when every hard gate
   passes; provider failures, unavailable credentials, ambiguous responses, and
   unsupported cleanup are explicit `fail` or `not-proven` outcomes.

The artifact records only token presence, safe token metadata, changed/not
changed comparisons, endpoint paths, request methods, status codes, sanitized
grant metadata, and exact dependency/provider versions. It never records token
values, authorization codes, PKCE verifiers, passwords, cookies, client
secrets, or Supabase keys. A downstream `not-proven` result after a conclusive
provider or delegation failure is expected and keeps the compatibility test
green while preserving the evidence boundary.

The local #767 execution on 2026-08-02 used the dedicated loopback app at
`http://127.0.0.1:3002/mcp` and the local Supabase Auth service. It recorded
the same bounded provider result: Protected Resource Metadata still advertised
`https://betterr.me` instead of the configured local Supabase issuer, and the
local provider discovery endpoint returned HTTP 404 with
`error_code=feature_disabled` (`OAuth server is disabled`). Refresh, replay,
grant, and post-revocation gates were therefore explicitly `not-proven`; no
credentials were configured or issued, and the Playwright test remained green
with outcome `blocked`.

## Public-client registration, loopback, and consent evidence (#765)

The #765 layer runs in the same Playwright compatibility test and uses the
official MCP SDK plus real nonproduction provider and browser boundaries. It
parameterizes the native public-client journey over both `127.0.0.1` and `::1`.
Registration uses authorization-code grant, code response, no token-endpoint
client authentication, and exactly one host/path-only loopback redirect. The
public registration boundary is also probed with unsupported client
authentication, grant and response types, malformed metadata, and unsafe
redirect metadata; unavailable or ambiguous responses remain `not-proven`.

Each family binds its callback on port `0`, verifies that the authorization
request selects the actual request-time port while preserving the registered
host and path, and only passes the full loopback/PKCE gate after a callback and
public-client code exchange. Before approval, the official Supabase client
checks the supported user-facing grant list and requires the newly registered
client to have no existing grant. The browser checks the Registered MCP Client
name, logo, URL, and software metadata as untrusted claims, requires an
authenticated user's explicit affirmative consent, and exercises fresh-client
denial and abandonment journeys. After each successful IPv4/IPv6 approval, the
same user-facing boundary identifies and revokes that family's grant. Denial
must return an OAuth error; abandonment must return no callback; neither path
may expose a code, access token, refresh token, ID token, or token request.

The layer records family-specific and aggregate `pass`, `fail`, or `not-proven`
gates with sanitized public-boundary evidence. It uses a harness-local SVG logo
fixture and does not add a BetterR.Me OAuth fallback, production cutover,
provider database access, route mocks, or a custom token/grant store.

The local #765 run on 2026-08-02 had no reachable provider target or dedicated
test identity. Canonical Resource/provider discovery therefore stopped the
family journeys, with IPv4/IPv6 registration, loopback, consent, denial, and
abandonment rows explicitly `not-proven`; exact dependency versions and
sanitized evidence were recorded. A configured nonproduction run must replace
those rows with observed provider and browser evidence; documentation alone
never passes a gate.

Official protocol and provider references used by the harness:

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Supabase OAuth server getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
