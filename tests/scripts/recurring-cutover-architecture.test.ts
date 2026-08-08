import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

describe("Recurring Task lifecycle cutover boundary", () => {
  it("keeps cron delivery on the separate aggregate maintenance capability", () => {
    const route = source("app/api/cron/prewarm-recurring-tasks/route.ts");

    expect(route).toContain("createRecurringTaskMaintenanceCapability");
    expect(route).toContain("RECURRING_TASK_MAINTENANCE_AUTHORITY");
    expect(route).toContain("operational_failure_count");
    expect(route).not.toMatch(
      /@\/lib\/recurring-tasks\/(activation|prewarming|observability|supabase-lifecycle)/,
    );
    expect(route).not.toContain("failed_series_ids");
    expect(route).not.toContain("attempts");
  });

  it("couples the application activation identifier to the release migration", () => {
    const activation = source("lib/recurring-tasks/internal/activation.ts");
    const migration = source(
      "supabase/migrations/20260803000001_activate_recurring_task_lifecycle.sql",
    );

    expect(activation).toContain(
      "20260803000001_activate_recurring_task_lifecycle",
    );
    expect(activation).toContain('mode: "lifecycle"');
    expect(migration).toContain(
      "20260803000001_activate_recurring_task_lifecycle",
    );
    expect(migration).toContain(
      "20260802000002_backfill_legacy_recurring",
    );
  });

  it("makes backfill and activation one idempotent, immutable transaction", () => {
    const migration = source(
      "supabase/migrations/20260803000001_activate_recurring_task_lifecycle.sql",
    );
    const backfillCall = migration.indexOf(
      "public.recurring_task_backfill_legacy(",
    );
    const markerInsert = migration.indexOf(
      "INSERT INTO public.recurring_task_lifecycle_cutover",
    );

    expect(backfillCall).toBeGreaterThan(-1);
    expect(markerInsert).toBeGreaterThan(backfillCall);
    expect(migration).toContain("IF FOUND THEN");
    expect(migration).toContain("'already-applied'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Recurring Task Lifecycle cutover is immutable");
    expect(migration).toContain("backfill_outcome->>'status' = 'complete'");
  });

  it("registers a database acceptance fixture for the release marker", () => {
    const registry = source("supabase/tests/registry.json");
    const fixture = source("supabase/tests/recurring_task_lifecycle_cutover.sql");

    expect(registry).toContain('"recurring_task_lifecycle_cutover.sql"');
    expect(registry).toContain(
      '"path": "recurring_task_lifecycle_cutover.sql",\n    "domain": "recurring-tasks",\n    "role": "admin"',
    );
    expect(fixture).toContain("recurring_task_lifecycle_cutover");
    expect(fixture).toContain("application role can operate the lifecycle cutover marker");
    expect(fixture).toContain("set local role authenticated;");
    expect(fixture).toContain("reset role;");
    expect(fixture).toContain("rollback;");
  });

  it("contracts retired recurrence storage only after the activated callers are installed", () => {
    const migration = source(
      "supabase/migrations/20260803000002_contract_recurring_task_lifecycle.sql",
    );
    const fixture = source("supabase/tests/recurring_task_legacy_contract.sql");
    const registry = source("supabase/tests/registry.json");

    expect(migration).toContain("$contract_guard$");
    expect(migration).toContain("backfill_outcome->>'status' = 'complete'");
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.recurring_task_backfill_legacy",
    );
    expect(migration).toContain(
      "DROP TABLE IF EXISTS public.recurring_tasks",
    );
    expect(migration).toContain("DROP COLUMN IF EXISTS recurring_task_id");
    expect(migration).toContain("DROP COLUMN IF EXISTS is_exception");
    expect(migration).toContain("DROP COLUMN IF EXISTS original_date");
    expect(fixture).toContain("obsolete recurring task table remains");
    expect(fixture).toContain("contract_rollback_probe");
    expect(fixture).toContain("has_function_privilege");
    expect(registry).toContain('"recurring_task_legacy_contract.sql"');
  });
});
