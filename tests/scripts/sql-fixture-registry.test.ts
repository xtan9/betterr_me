import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("SQL fixture registry", () => {
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
});
