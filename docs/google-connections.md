# Google read-only connections

Approved 2026-09-24 by the user. Product spec and Muse research live in the companion mobile repository: `docs/google-connections-discovery.md` and `docs/muse-google-connections-research.md` on `codex/google-connections`.

## Behavior

- One Google account per service; Gmail and Calendar can use different accounts. BetterRMe login remains separate.
- Settings and AI Chat share connection management. Chat shows only missing services, remembers dismissal per BetterRMe user, and offers a contextual entry for new questions explicitly about missing external data.
- Gmail searches relevant mail on request: up to ten messages, text/snippet only, no attachment downloads, no background ingestion. Calendar reads selected calendars on demand, expanding occurrences with exclusive all-day ends and preserving timed instants.
- Google events appear as protected, read-only commitments in Today/Calendar and planning. Failed reads prevent assuming those periods are free. Acceptance checks current Google conflicts before the existing schedule command.
- No Google write APIs or write scopes. External content is untrusted model input. Provider-derived answers include source links; external readings are not automatically written into long-term AI memory. Answers/source references remain in existing chat history.
- Stop using removes one local connection. Revoke Google access affects the Google account's project-level grant and invalidates both services attached to that subject. Historical chats remain.

## Deployment order and configuration

This is a private installed-app/TestFlight feature. Backend must ship before the mobile build: mobile schedule acceptance now uses `/api/mobile/planning/command`, even without a Google connection.

1. Apply `supabase/migrations/20260925033125_google_readonly_connections.sql` through the normal reviewed deployment. Both tables have RLS and no user/anonymous policies; only the server service role can access encrypted credentials and one-time attempts.
2. Use a dedicated Google Cloud project (avoid sharing grants with BetterRMe login). Enable Gmail API and Google Calendar API. Configure the consent screen and explicitly allow the intended test accounts.
3. Create a **Web application** OAuth client for the server-mediated flow. Register the exact HTTPS backend callback, e.g. `https://<backend>/api/mobile/connections/callback`. Authorization runs in the native system browser; the server returns only state/code to fixed `betterrme://connections/callback`. The installed app exchanges them using the BetterRMe bearer session. Do not register an Expo Go URL as the server callback.
4. Set server-only deployment secrets: `GOOGLE_CONNECTIONS_CLIENT_ID`, `GOOGLE_CONNECTIONS_CLIENT_SECRET`, `GOOGLE_CONNECTIONS_REDIRECT_URI` (the exact callback above), and `GOOGLE_CONNECTIONS_ENCRYPTION_KEY` (32 random bytes encoded as base64). Never set these as `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`. Keep the encryption key backed up securely; changing it requires reconnecting stored credentials unless an explicit key migration is implemented.
5. Request only `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` for Gmail, or `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.readonly`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly` for Calendar. Broader returned grants are rejected. Existing broad project grants may need revocation before reconnecting.
6. Confirm the installed build uses the `betterrme` scheme and the intended backend URL. Web/Expo Go connection attempts explain that an installed build is required.

The feature remains unavailable until all four server settings exist. Google credentials were not present in the inspected local environment; no production migration, secret configuration, deployment, or real-user authorization was performed during implementation.

Google's external Testing mode can yield short-lived refresh tokens; the app exposes reconnect. Gmail readonly is restricted: public release has separate verification/security-assessment requirements depending on use. See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth server flow](https://developers.google.com/identity/protocols/oauth2/web-server), and [OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## Acceptance and limitations

Automated tests must cover bearer ownership, one-time state/PKCE, narrow scopes, encryption and non-disclosure, concurrent callback/disconnect, stale read rejection, partial/failed reads, calendar choice and timezone semantics, protected schedule conflicts, missing-connector UI combinations and dismissal. A disposable Postgres/PostgREST integration test verifies actual grants/RLS and compare-and-set behavior; it is opt-in via `GOOGLE_CONNECTIONS_TEST_URL=http://127.0.0.1:55462` and rejects other targets.

Before TestFlight rollout, use the installed iPhone app to verify successful/cancelled/partial authorizations, cold and warm callback, separate accounts, reconnect and project-wide revocation, real Gmail answers and citations, calendar choice/recurrence/all-day/DST, read failures, and protected planning. Repeat UI checks in English/Chinese, dark/light and VoiceOver. Mock tests do not fulfill this acceptance.

Google reads and a local database commit cannot form one transaction: acceptance rechecks conflicts immediately before commit, but a Google edit after that check can still conflict. Local credentials are deleted on stop; credentials are not remotely revoked until the separate account-wide action. The existing authenticated database schedule RPC remains available to older clients; only this mobile version's acceptance path performs the new external check. This feature does not change web planning paths or migrate older clients.
