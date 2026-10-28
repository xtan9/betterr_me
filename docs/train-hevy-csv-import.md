# Hevy workout CSV import

The supplied workout CSV is the implementation brief. It uses Hevy's English,
14-column imperial export format. The original file stays outside the repository;
all checked-in CSV/JSON/native fixtures are synthetic.

## User behavior and acceptance

Train → More training actions → Import from Hevy opens a native SwiftUI sheet.
The system document picker selects an English Hevy workout CSV, with a 2 MB UTF-8
limit and a 4.2 MB encoded request budget, below the [host's 4.5 MB limit](https://vercel.com/docs/functions/limitations).
Selection/cancellation does not write history. Review shows dates, source
counts, original exercise names, new records, duplicates and changed matches.
Only explicit confirmation imports; retry reuses the reviewed file fingerprint.
Reopening the same export retrieves its previous import and undo outcome.

Accepted records belong to the signed-in account and feed the existing current
history, Progress and Calendar. Import never occupies the active workout slot,
starts a workout, creates a training plan, or fulfills a planned occurrence.
Account/source changes fence late picker, preview and write acknowledgments.
Loaded history remains visible through background refresh.

The exported `weight_lbs` and `distance_miles` columns establish their units.
Conversion uses exact decimal factors before JS number conversion. Empty values
stay unknown and explicit zero stays zero. Original descriptions, exercise notes,
superset membership, warm-up/failure/drop types, RPE and all 14 source strings are
retained. Unknown layouts, malformed quoting, dates and numeric values reject
before import; an invalid batch rolls back atomically.

Dates use Hevy's stated civil day. The file has no timezone, so start/end strings
remain source evidence, while absolute instants and total workout duration remain
unknown. Per-set duration remains recorded. A later explicit day/duration
correction is revisioned normally and does not rewrite the source rows.

Imported exercise identities stay separate and archived, with unknown comparison
convention. A name alone cannot prove dumbbell, assistance or added-load meaning.
These records remain visible but are excluded from strength comparisons until
an explicit mapping feature establishes that meaning. This version imports workout
history; measurements, reusable templates and API synchronization are outside scope.

## Durable account boundary

`POST /api/mobile/train/imports/hevy` supports `preview`, `commit` and `undo` under
the existing verified native bearer session. The server parses the original CSV;
SQL revalidates its source row arrays and owns the atomic import. The mobile and
backend parsers use the same source and synthetic wire fixture.

Private account-scoped batch/source ledgers retain original outcomes and source
identities after deletion. Same-file retry returns its first receipt. Re-exported
identical workouts are skipped across batches; the same source identity with
different source facts is a changed match and is skipped without overwrite.
Possible changed matches are also skipped when a source start is retained, or
when the title and ending are retained. Missing rows never imply deletion. Edits
that change both matching anchors can remain a distinct identity; CSV exports
have no durable workout ID, so those cases need manual comparison.

Undo removes only records added by that batch whose current revision is still 1.
Already deleted records count as removed; later corrections are preserved.
Repeated undo is idempotent. Retrying an old create never resurrects a deletion.

Backend migration `20261027234402_train_hevy_csv_import.sql` expands precision for
distance/RPE, adds private import ledgers and an explicit date-only legacy bridge.
Existing frozen snapshots and ordinary recording/definition guards are retained.
No existing row is assigned a guessed exercise convention or timezone.

## Validation and evidence boundaries

- Parser/source tests: quoted fields/newlines/BOM, row order, numeric precision,
  malformed input, reviewed-file binding, account fencing and acknowledgment checks.
- Real AppShell + SQLite + controlled remote: explicit review, lost acknowledgment
  retry, normal history visibility, duplicate review, undo, active draft preservation
  and late account-switch responses. SQL-produced fixture records drive the reader.
- Disposable PostgreSQL: original capture preservation, exact source fields and
  conversions, active recording, changed-match conflict, rollback, account isolation,
  date correction, correction-aware undo and deletion/retry. The private export also
  round-tripped every source workout and set locally; no live account import ran.
- Native entry: `train-hevy-import-entry`, guarded isolated SQLite and controlled
  remote data. The maintained `hevy-import` suite downloads only its synthetic CSV
  from the primary 8082 server and exercises the real system picker and native UI.
- Physical build currently requires Xcode account/profiles covering BetterRMe's
  App Groups, Family Controls, push and Apple sign-in capabilities. A detected
  development identity alone did not satisfy provisioning. Simulator acceptance,
  physical acceptance, hosted CI and live endpoint rollout must be reported separately.
