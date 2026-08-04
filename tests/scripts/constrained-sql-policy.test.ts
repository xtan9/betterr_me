import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { constrainedSqlFixtureViolations } from "../../scripts/ci/constrained-sql-policy.mjs";

const safeFixture = `-- constrained-sql-fixture: true
begin;
select public.some_ticket_function();
rollback;
`;

const runnerScript = fs.readFileSync(
  path.resolve(process.cwd(), "scripts/ci/run-constrained-sql-fixtures.sh"),
  "utf8",
);

describe("Constrained SQL fixture policy", () => {
  it("reuses an existing constrained runner role without privileged ALTER clauses", () => {
    expect(runnerScript).not.toMatch(
      /alter role sql_fixture_test[\s\S]{0,160}\bnosuperuser\b/i,
    );
    expect(runnerScript).toContain("runner role has unsafe attributes");
    expect(runnerScript).toContain("runner role has unsafe memberships");
  });

  it("opens fixture concurrency sessions on the database server endpoint", () => {
    expect(runnerScript).toContain("hostaddr=' || host(inet_server_addr())");
    expect(runnerScript).toContain("' port=' || inet_server_port()");
    expect(runnerScript).not.toContain("host=127.0.0.1 port=54322 dbname=postgres");
    expect(runnerScript).toContain(
      "extensions.dblink_exec(connection_name, 'set role authenticated')",
    );
  });

  it("uses the local Supabase admin boundary for auth and extension grants", () => {
    expect(runnerScript).toContain(
      "auth_admin_database_url=\"${CONSTRAINED_SQL_FIXTURE_AUTH_ADMIN_DATABASE_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres}\"",
    );
    expect(runnerScript).toContain('psql "$auth_admin_database_url"');
    expect(runnerScript).toContain(
      "alter extension dblink set schema extensions",
    );
  });

  it("exposes narrow test-user setup without granting direct auth-table writes", () => {
    expect(runnerScript).toContain(
      "create or replace function public.sql_fixture_create_auth_user(",
    );
    expect(runnerScript).toContain(
      "create or replace function public.sql_fixture_delete_auth_user(",
    );
    expect(runnerScript).toContain("email like '%@example.test'");
    expect(runnerScript).not.toContain(
      "grant all privileges on all tables in schema auth to sql_fixture_test",
    );
    expect(runnerScript).not.toContain(
      "grant usage, create on schema public to sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "revoke create on schema public from sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "revoke usage on schema auth from sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "revoke all privileges on all tables in schema auth from sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "revoke all privileges on all sequences in schema auth from sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "revoke execute on all functions in schema auth from sql_fixture_test",
    );
  });

  it("removes ambient public-function execution before granting runner helpers", () => {
    expect(runnerScript).not.toContain(
      "grant execute on all functions in schema public to sql_fixture_test",
    );
    expect(runnerScript).not.toContain(
      "revoke execute on all functions in schema public from sql_fixture_test",
    );
    expect(runnerScript).toMatch(
      /has_function_privilege\(\s*current_user,\s*routine\.oid,\s*'EXECUTE WITH GRANT OPTION'\s*\)/,
    );
    expect(runnerScript).toContain(
      "revoke execute on function %s from sql_fixture_test",
    );
    expect(runnerScript).toContain(
      "runner retains an unexpected direct public function grant",
    );
    expect(runnerScript).toContain(
      "grant execute on function public.sql_fixture_create_auth_user(uuid, text)",
    );
    expect(runnerScript).toContain(
      "grant execute on function public.sql_fixture_delete_auth_user(uuid)",
    );
    expect(runnerScript).toContain(
      "grant execute on function public.sql_fixture_open_connection(text) to sql_fixture_test",
    );
  });

  it("removes the legacy postgres-owned connection helper before admin bootstrap", () => {
    expect(runnerScript).toContain(
      "drop function public.sql_fixture_open_connection(text)",
    );
    expect(runnerScript).toContain("legacy_wrapper_owner = current_user");
  });

  it("accepts a marked transactional fixture", () => {
    expect(constrainedSqlFixtureViolations(safeFixture)).toEqual([]);
  });

  it.each([
    ["psql shell escape", `${safeFixture}\\! env`],
    ["inline psql shell escape", `${safeFixture}select 1; \\! env`],
    ["inline psql include", `${safeFixture}select 1; \\include /tmp/payload.sql`],
    ["inline psql copy", `${safeFixture}select 1; \\copy data to program 'env'`],
    ["server program execution", `${safeFixture}copy data to program 'env';`],
    ["server file read", `${safeFixture}select pg_read_file('/etc/passwd');`],
    ["role escalation", `${safeFixture}set role postgres;`],
    ["Supabase role escalation", `${safeFixture}set local role service_role;`],
    ["role creation", `${safeFixture}create role attacker superuser;`],
    [
      "procedural dblink escape",
      `${safeFixture}do $$ begin perform extensions.dblink_connect('x', 'user=' || 'post' || 'gres password=postgres'); end $$;`,
    ],
    [
      "postgres dblink",
      `${safeFixture}select dblink_connect('x', 'postgresql://postgres:postgres@127.0.0.1/postgres');`,
    ],
    [
      "dynamically constructed dblink",
      `${safeFixture}select extensions.dblink_connect_u('x', 'user=' || 'post' || 'gres');`,
    ],
  ])("rejects %s", (_label, fixture) => {
    expect(constrainedSqlFixtureViolations(fixture)).not.toEqual([]);
  });

  it("requires an exact marker near the top", () => {
    expect(constrainedSqlFixtureViolations("begin; select 1; rollback;")).toContain(
      "missing exact opt-in marker in the first 12 lines",
    );
  });

  it("allows backslashes only inside SQL quoting or comments", () => {
    expect(
      constrainedSqlFixtureViolations(`${safeFixture}
select '\\! literal', E'\\\\path', $$\\copy literal$$;
-- select 1; \\! ignored
/* \\include ignored */
set local role authenticated;
reset role;
`),
    ).toEqual([]);
  });

  it("allows procedural assertions inside the low-privilege database sandbox", () => {
    expect(
      constrainedSqlFixtureViolations(`${safeFixture}
do $$
begin
  if 1 is distinct from 1 then
    raise exception 'assertion failed';
  end if;
end
$$;
`),
    ).toEqual([]);
  });
});
