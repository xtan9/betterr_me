# Legacy Profile contract retirement

This runbook applies to issue #675. The retirement is a destructive contract
change and is independently deployable only after the compatibility gate in
#674 has completed.

## Prerequisites

Before merging or applying the retirement migration:

1. Confirm issue #674 is closed by merged PR #730, whose merge SHA is
   `90d0276d7fa02456095bdbe9bd581c90ff800514`.
2. Confirm the application and migration commit are descendants of that merge.
   The Database Migration workflow checks both the closed issue and the commit
   relationship before it can run the retirement migration.
3. Run the production caller scan and the canonical Current Profile, owner
   command, architecture, database, and authenticated-browser suites on the
   exact commit being deployed.
4. Deploy the application code that uses Current Profile and named owner
   commands before allowing the retirement migration to execute.

The migration itself fails closed if any profile has a missing, malformed, or
different nested `email_notifications_enabled` value. Unknown Preference keys
and dormant `date_format` storage remain inside the JSON document.

## Migration boundary

`20260804000001_retire_legacy_profile_contracts.sql` drops the duplicated
top-level email column and the row-shaped browser/service Preference RPCs only
after the authority check succeeds. It retains the private generic merger,
named owner commands, and a service-role-only `disable_reminder_email_for_service`
command for unsubscribe jobs.

## Rollback

Before the migration runs, application rollback is a normal deployment rollback.
After it runs, do not roll back to an application build that calls the deleted
routes, helpers, column, or broad RPCs. The old contracts cannot be restored by
an application-only rollback. Use the managed database backup or a reviewed
forward migration to restore a compatible schema, then deploy the matching
application version. Revalidate Current Profile and every owner command before
serving traffic again. Never reconstruct Preferences by replacing the JSON
document; preserve unknown keys and dormant date-format values during recovery.
