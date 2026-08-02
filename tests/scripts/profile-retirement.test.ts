import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retirementMigration = readFileSync(
  "supabase/migrations/20260804000001_retire_legacy_profile_contracts.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const migrationWorkflow = readFileSync(
  ".github/workflows/db-migrate.yml",
  "utf8",
).replaceAll("\r\n", "\n");
const retirementNotes = readFileSync(
  "docs/deployment/legacy-profile-retirement.md",
  "utf8",
).replaceAll("\r\n", "\n");

describe("legacy Profile retirement boundary", () => {
  it("fails closed before dropping the duplicated email column", () => {
    expect(retirementMigration).toMatch(
      /mismatch_count[\s\S]*?email_notifications_enabled[\s\S]*?raise exception/i,
    );
    expect(retirementMigration).toContain(
      "alter table public.profiles\n  drop column email_notifications_enabled",
    );
  });

  it("removes both broad envelopes while retaining a narrow service command", () => {
    expect(retirementMigration).toContain(
      "drop function if exists public.update_profile_preferences(uuid, jsonb)",
    );
    expect(retirementMigration).toContain(
      "drop function if exists public.update_profile_preferences_for_service(uuid, jsonb)",
    );
    expect(retirementMigration).toContain(
      "create or replace function public.disable_reminder_email_for_service",
    );
    expect(retirementMigration).toContain(
      "revoke execute on function public.merge_profile_preference_intent(jsonb)",
    );
  });

  it("requires the closed #674 merge before applying the retirement migration", () => {
    expect(migrationWorkflow).toContain("issues: read");
    expect(migrationWorkflow).toContain(
      "repos/${GITHUB_REPOSITORY}/issues/${REQUIRED_GATE_ISSUE}",
    );
    expect(migrationWorkflow).toContain(
      "90d0276d7fa02456095bdbe9bd581c90ff800514",
    );
    expect(migrationWorkflow).toContain(
      "20260804000001_retire_legacy_profile_contracts.sql",
    );
  });

  it("documents the prerequisite and irreversible rollback boundary", () => {
    expect(retirementNotes).toContain("#674");
    expect(retirementNotes).toContain(
      "90d0276d7fa02456095bdbe9bd581c90ff800514",
    );
    expect(retirementNotes).toMatch(/rollback/i);
    expect(retirementNotes).toMatch(/unknown|dormant/i);
  });

  it("does not retain compatibility-only production surfaces", () => {
    for (const path of [
      "app/api/profile/route.ts",
      "app/api/profile/preferences/route.ts",
      "lib/profile-preference-cache.ts",
      "lib/submit-profile-preference-intent.ts",
      "lib/legacy-telemetry.ts",
      "lib/db/profiles.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });
});
