import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

describe("Recurring Task lifecycle cutover boundary", () => {
  it("couples the application activation identifier to the release migration", () => {
    const activation = source("lib/recurring-tasks/activation.ts");
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
    expect(fixture).toContain("recurring_task_lifecycle_cutover");
    expect(fixture).toContain("application role can operate the lifecycle cutover marker");
    expect(fixture).toContain("rollback;");
  });
});
