import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadSqlFixtureRegistry,
  selectSqlFixtures,
  validateSqlFixtureRegistry,
} from "../../scripts/ci/sql-fixture-registry.mjs";

const temporaryDirectories: string[] = [];

function createFixtureRepository(
  registry: unknown,
  fixtures: Record<string, string>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "betterr-sql-fixtures-"));
  temporaryDirectories.push(root);
  const fixtureDirectory = path.join(root, "supabase", "tests");
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDirectory, "registry.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
  );
  for (const [name, sql] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(fixtureDirectory, name), sql);
  }
  return root;
}

function runRegistryCli(args: string[], cwd = process.cwd()) {
  return spawnSync(
    process.execPath,
    [path.resolve(process.cwd(), "scripts/ci/sql-fixture-registry.mjs"), ...args],
    { cwd, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("SQL fixture registry", () => {
  it("registers the personal-records and finance RLS group as one targeted fixture", () => {
    const repositoryRoot = path.resolve(__dirname, "../..");
    const registry = loadSqlFixtureRegistry(repositoryRoot);

    expect(selectSqlFixtures(registry, { domain: "personal-records-finance" })).toEqual([
      {
        path: "personal_records_finance_rls.sql",
        domain: "personal-records-finance",
        role: "constrained",
        cleanup: "transactional",
      },
    ]);
    expect(validateSqlFixtureRegistry(repositoryRoot, registry)).toEqual([]);
  });

  it("registers the project mutation lifecycles as constrained acceptance fixtures", () => {
    const registry = loadSqlFixtureRegistry(process.cwd());

    expect(selectSqlFixtures(registry, { domain: "projects" })).toEqual([
      {
        path: "project_creation_lifecycle.sql",
        domain: "projects",
        role: "constrained",
        cleanup: "self-cleaning",
      },
      {
        path: "project_changes_lifecycle.sql",
        domain: "projects",
        role: "constrained",
        cleanup: "self-cleaning",
      },
    ]);
    expect(validateSqlFixtureRegistry(process.cwd(), registry)).toEqual([]);
  });

  it("keeps the complete calendar lifecycle group registered in stable order", () => {
    const registry = loadSqlFixtureRegistry(process.cwd());

    expect(validateSqlFixtureRegistry(process.cwd(), registry)).toEqual([]);
    expect(
      selectSqlFixtures(registry, { domain: "calendar" }).map(
        (entry: { path: string }) => entry.path,
      ),
    ).toEqual([
      "calendar_event_reminder_lifecycle.sql",
      "calendar_event_reminder_delete_lifecycle.sql",
      "calendar_event_reminder_update_lifecycle.sql",
    ]);
  });

  it("selects acceptance fixtures in registry order with narrow filters", () => {
    const registry = [
      {
        path: "calendar_create.sql",
        domain: "calendar",
        role: "admin",
        cleanup: "transactional",
        adminReason: "creates a disposable auth identity",
      },
      {
        path: "calendar_update.sql",
        domain: "calendar",
        role: "constrained",
        cleanup: "transactional",
      },
      {
        path: "oauth_rotation.sql",
        domain: "oauth",
        role: "admin",
        cleanup: "self-cleaning",
        adminReason: "exercises independent database sessions",
      },
      {
        path: "browser_grants.sql",
        kind: "support",
        reason: "prepares the disposable browser-test database",
      },
    ];

    expect(selectSqlFixtures(registry)).toEqual(registry.slice(0, 3));
    expect(selectSqlFixtures(registry, { domain: "calendar" })).toEqual(
      registry.slice(0, 2),
    );
    expect(selectSqlFixtures(registry, { fixture: "update" })).toEqual([
      registry[1],
    ]);
  });

  it("selects the planning and work-management RLS group by domain", () => {
    const registry = loadSqlFixtureRegistry();
    const selected = selectSqlFixtures(registry, {
      domain: "planning-work-management",
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].path).toBe("planning_work_management_rls.sql");
  });

  it("accepts a registered transactional fixture", () => {
    const root = createFixtureRepository(
      [
        {
          path: "passing.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "transactional",
        },
      ],
      {
        "passing.sql":
          "-- ralph-ci: true\nbegin;\nselect 1;\nrollback;\n",
      },
    );

    const registry = loadSqlFixtureRegistry(root);
    expect(validateSqlFixtureRegistry(root, registry)).toEqual([]);
  });

  it("rejects a fixture whose declared cleanup policy is false", () => {
    const root = createFixtureRepository(
      [
        {
          path: "leaking.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "transactional",
        },
      ],
      {
        "leaking.sql": "-- ralph-ci: true\nbegin;\ninsert into x values (1);\ncommit;\n",
      },
    );

    const violations = validateSqlFixtureRegistry(
      root,
      loadSqlFixtureRegistry(root),
    );
    expect(violations).toContain(
      "supabase/tests/leaking.sql: transactional fixture must end with ROLLBACK and must not COMMIT",
    );
  });

  it("reports every eligible SQL fixture omitted from the registry", () => {
    const root = createFixtureRepository([], {
      "forgotten.sql": "begin;\nselect 1;\nrollback;\n",
    });

    expect(
      validateSqlFixtureRegistry(root, loadSqlFixtureRegistry(root)),
    ).toEqual([
      "supabase/tests/forgotten.sql: eligible SQL fixture is not registered; add it to supabase/tests/registry.json",
    ]);
  });

  it("does not let a newly registered fixture request database administrator access", () => {
    const root = createFixtureRepository(
      [
        {
          path: "ticket_fixture.sql",
          domain: "ticket",
          role: "admin",
          cleanup: "transactional",
          adminReason: "the ticket requested elevated database access",
        },
      ],
      {
        "ticket_fixture.sql": "begin;\nselect 1;\nrollback;\n",
      },
    );

    expect(
      validateSqlFixtureRegistry(root, loadSqlFixtureRegistry(root)),
    ).toContain(
      "supabase/tests/ticket_fixture.sql: only a runner-trusted fixture may use the admin role",
    );
  });

  it("does not let a newly registered fixture opt out as support", () => {
    const root = createFixtureRepository(
      [
        {
          path: "ticket_fixture.sql",
          kind: "support",
          reason: "the ticket requested that this fixture not run",
        },
      ],
      { "ticket_fixture.sql": "select 1;\n" },
    );

    expect(
      validateSqlFixtureRegistry(root, loadSqlFixtureRegistry(root)),
    ).toContain(
      "supabase/tests/ticket_fixture.sql: only a runner-trusted file may be registered as support",
    );
  });

  it("reports malformed registry entries and constrained-role policy violations", () => {
    const root = createFixtureRepository(
      [
        null,
        {
          path: "Bad.SQL",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
        },
        {
          path: "missing.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
        },
        {
          path: "duplicate.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
        },
        {
          path: "duplicate.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
        },
        {
          path: "support.sql",
          kind: "support",
          reason: "short",
          unexpected: true,
        },
        {
          path: "acceptance.sql",
          domain: "Runner Domain",
          role: "elevated",
          cleanup: "leaking",
          adminReason: "not allowed for constrained fixture",
          unexpected: true,
        },
        {
          path: "admin.sql",
          domain: "runner",
          role: "admin",
          cleanup: "self-cleaning",
        },
        {
          path: "constrained.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
          adminReason: "only applies to admins",
        },
      ],
      {
        "duplicate.sql": "-- ralph-ci: true\nselect 1;\n",
        "support.sql": "select 1;\n",
        "acceptance.sql": "select 1;\n",
        "admin.sql": "select 1;\n",
        "constrained.sql": "-- ralph-ci: true\ncreate role temporary_runner;\n",
      },
    );

    const violations = validateSqlFixtureRegistry(
      root,
      loadSqlFixtureRegistry(root),
    );
    expect(violations).toEqual(expect.arrayContaining([
      "supabase/tests/registry.json[0]: entry must be an object",
      "supabase/tests/registry.json[1]: path must be a top-level snake-case .sql filename",
      "supabase/tests/missing.sql: registered fixture does not exist",
      "supabase/tests/duplicate.sql: fixture is registered more than once",
      "supabase/tests/support.sql: unknown support registry field unexpected",
      "supabase/tests/support.sql: support entry requires an actionable reason",
      "supabase/tests/support.sql: only a runner-trusted file may be registered as support",
      "supabase/tests/acceptance.sql: unknown acceptance registry field unexpected",
      "supabase/tests/acceptance.sql: acceptance fixture requires a domain",
      "supabase/tests/acceptance.sql: role must be constrained or admin",
      "supabase/tests/acceptance.sql: cleanup must be transactional or self-cleaning",
      "supabase/tests/acceptance.sql: adminReason is only valid for admin fixtures",
      "supabase/tests/admin.sql: admin role requires a least-privilege explanation",
      "supabase/tests/admin.sql: only a runner-trusted fixture may use the admin role",
      "supabase/tests/constrained.sql: adminReason is only valid for admin fixtures",
      "supabase/tests/constrained.sql: constrained-role policy: role administration",
    ]));
    expect(validateSqlFixtureRegistry(root, {})).toEqual([
      "supabase/tests/registry.json: registry must be a JSON array",
    ]);
  });

  it("keeps the registry CLI exit codes and output aligned with its public contract", () => {
    const root = createFixtureRepository(
      [
        {
          path: "passing.sql",
          domain: "runner",
          role: "constrained",
          cleanup: "self-cleaning",
        },
      ],
      { "passing.sql": "-- ralph-ci: true\nselect 1;\n" },
    );

    expect(runRegistryCli(["--validate", "--root", root])).toMatchObject({
      status: 0,
      stderr: "",
    });
    expect(runRegistryCli(["--plan", "--domain", "runner", "--root", root])).toMatchObject({
      status: 0,
      stdout: "passing.sql\trunner\tconstrained\tself-cleaning\n",
    });
    expect(runRegistryCli(["--plan", "--fixture", "missing", "--root", root])).toMatchObject({
      status: 1,
    });
    expect(runRegistryCli([])).toMatchObject({ status: 2 });
    expect(runRegistryCli(["--validate", "--plan"])).toMatchObject({ status: 2 });
    expect(runRegistryCli(["--unknown"])).toMatchObject({ status: 2 });

    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "betterr-sql-missing-"));
    temporaryDirectories.push(missingRoot);
    expect(runRegistryCli(["--validate", "--root", missingRoot])).toMatchObject({
      status: 1,
    });
  });
});
