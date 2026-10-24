# Mobile Google calendar read snapshots

Companion to [mobile #403](https://github.com/xtan9/betterr_me_mobile/issues/403)
and the accepted [data reliability scope](https://github.com/xtan9/betterr_me_mobile/issues/398).

Authenticated `GET /api/mobile/connections?action=events` returns `events`,
`source: { email, selectedCalendars, revision }`, normalized UTC `start`/`end`,
and `fetchedAt`. The source comes from the same connection record used for the
provider read. The existing post-read revision check rejects concurrent selection,
disconnect or replacement; a complete empty range still includes its identity.
Failure of any selected calendar rejects the whole overlay.

Public status and selection responses add the opaque connection `revision`.
No credential, OAuth subject, token or authorization URL belongs in this response.
The authenticated session continues to determine the BetterRMe owner.
`GoogleReads.events()` remains available to web/legacy callers as an event array.

The mobile client namespaces disk data by BetterRMe owner and backend/API origin,
then compares provider email, selected calendar IDs, revision, timezone and UTC
range before restoring a snapshot. If events identify a different web selection,
the client fences the prior agenda and revalidates status. Deploy this additive
backend response before claiming persistent Google calendar recovery in production;
older responses still support live reads but cannot establish a safe cache identity.

Validation: Google service + authenticated native route tests cover source-stamped
empty ranges, selection changes during reads and safe public fields. The full
backend suite passed before merging the latest app-limit integration (495 test
files, 6,153 tests; 6 files/21 environment or database cases skipped). No hosted
configuration, database or provider account was changed for this companion.
