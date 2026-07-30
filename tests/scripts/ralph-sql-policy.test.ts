import { describe, expect, it } from "vitest";

import { ralphSqlFixtureViolations } from "../../scripts/ci/ralph-sql-policy.mjs";

const safeFixture = `-- ralph-ci: true
begin;
select public.some_ticket_function();
rollback;
`;

describe("Ralph SQL fixture policy", () => {
  it("accepts a marked transactional fixture", () => {
    expect(ralphSqlFixtureViolations(safeFixture)).toEqual([]);
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
    expect(ralphSqlFixtureViolations(fixture)).not.toEqual([]);
  });

  it("requires an exact marker near the top", () => {
    expect(ralphSqlFixtureViolations("begin; select 1; rollback;")).toContain(
      "missing exact opt-in marker in the first 12 lines",
    );
  });

  it("allows backslashes only inside SQL quoting or comments", () => {
    expect(
      ralphSqlFixtureViolations(`${safeFixture}
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
      ralphSqlFixtureViolations(`${safeFixture}
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
