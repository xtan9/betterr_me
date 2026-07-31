import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ralphSqlFixtureViolations } from "./ralph-sql-policy.mjs";

const REGISTRY_PATH = path.join("supabase", "tests", "registry.json");
const REGISTRY_DISPLAY_PATH = "supabase/tests/registry.json";
const FIXTURE_DIRECTORY = path.join("supabase", "tests");
const ACCEPTANCE_FIELDS = new Set([
  "path",
  "domain",
  "role",
  "cleanup",
  "adminReason",
]);
const SUPPORT_FIELDS = new Set(["path", "kind", "reason"]);
const TRUSTED_ADMIN_FIXTURES = new Set([
  "calendar_event_reminder_lifecycle.sql",
  "control_plane_authorization.sql",
  "finance_cushion_rls.sql",
  "oauth_refresh_token_lifecycle.sql",
  "oauth_refresh_token_upgrade.sql",
]);
const TRUSTED_SUPPORT_FIXTURES = new Set(["e2e_local_authenticated_grants.sql"]);

function relativeFixturePath(name) {
  return path.posix.join("supabase/tests", name);
}

function sqlWithoutComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .trim();
}

function unknownFields(entry, allowedFields) {
  return Object.keys(entry).filter((field) => !allowedFields.has(field));
}

export function loadSqlFixtureRegistry(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), "utf8"));
}

export function selectSqlFixtures(registry, filters = {}) {
  return registry.filter((entry) => {
    if (entry.kind === "support") return false;
    if (filters.domain && entry.domain !== filters.domain) return false;
    if (filters.fixture && !entry.path.includes(filters.fixture)) return false;
    return true;
  });
}

export function validateSqlFixtureRegistry(root, registry) {
  const violations = [];
  if (!Array.isArray(registry)) {
    return [`${REGISTRY_DISPLAY_PATH}: registry must be a JSON array`];
  }

  const fixtureDirectory = path.join(root, FIXTURE_DIRECTORY);
  const eligibleFixtures = fs
    .readdirSync(fixtureDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const registeredPaths = new Set();

  for (const [index, entry] of registry.entries()) {
    const location = `${REGISTRY_DISPLAY_PATH}[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      violations.push(`${location}: entry must be an object`);
      continue;
    }
    if (typeof entry.path !== "string" || !/^[a-z0-9][a-z0-9_-]*\.sql$/.test(entry.path)) {
      violations.push(`${location}: path must be a top-level snake-case .sql filename`);
      continue;
    }
    const fixtureLocation = relativeFixturePath(entry.path);
    if (registeredPaths.has(entry.path)) {
      violations.push(`${fixtureLocation}: fixture is registered more than once`);
      continue;
    }
    registeredPaths.add(entry.path);

    const fixturePath = path.join(fixtureDirectory, entry.path);
    if (!fs.existsSync(fixturePath)) {
      violations.push(`${fixtureLocation}: registered fixture does not exist`);
      continue;
    }

    if (entry.kind === "support") {
      for (const field of unknownFields(entry, SUPPORT_FIELDS)) {
        violations.push(`${fixtureLocation}: unknown support registry field ${field}`);
      }
      if (typeof entry.reason !== "string" || entry.reason.trim().length < 12) {
        violations.push(`${fixtureLocation}: support entry requires an actionable reason`);
      }
      if (!TRUSTED_SUPPORT_FIXTURES.has(entry.path)) {
        violations.push(`${fixtureLocation}: only a runner-trusted file may be registered as support`);
      }
      continue;
    }

    for (const field of unknownFields(entry, ACCEPTANCE_FIELDS)) {
      violations.push(`${fixtureLocation}: unknown acceptance registry field ${field}`);
    }
    if (typeof entry.domain !== "string" || !/^[a-z0-9-]+$/.test(entry.domain)) {
      violations.push(`${fixtureLocation}: acceptance fixture requires a domain`);
    }
    if (!new Set(["constrained", "admin"]).has(entry.role)) {
      violations.push(`${fixtureLocation}: role must be constrained or admin`);
    }
    if (!new Set(["transactional", "self-cleaning"]).has(entry.cleanup)) {
      violations.push(`${fixtureLocation}: cleanup must be transactional or self-cleaning`);
    }
    if (
      entry.role === "admin" &&
      (typeof entry.adminReason !== "string" || entry.adminReason.trim().length < 12)
    ) {
      violations.push(`${fixtureLocation}: admin role requires a least-privilege explanation`);
    }
    if (entry.role === "admin" && !TRUSTED_ADMIN_FIXTURES.has(entry.path)) {
      violations.push(`${fixtureLocation}: only a runner-trusted fixture may use the admin role`);
    }
    if (entry.role !== "admin" && entry.adminReason != null) {
      violations.push(`${fixtureLocation}: adminReason is only valid for admin fixtures`);
    }

    const sql = fs.readFileSync(fixturePath, "utf8");
    if (entry.cleanup === "transactional") {
      const executableSql = sqlWithoutComments(sql);
      if (
        !/^begin\s*;/i.test(executableSql) ||
        !/rollback\s*;\s*(?:\\[A-Za-z]+[^\r\n]*)?\s*$/i.test(executableSql) ||
        /\bcommit\s*;/i.test(executableSql)
      ) {
        violations.push(
          `${fixtureLocation}: transactional fixture must end with ROLLBACK and must not COMMIT`,
        );
      }
    }
    if (entry.role === "constrained") {
      for (const violation of ralphSqlFixtureViolations(sql)) {
        violations.push(`${fixtureLocation}: constrained-role policy: ${violation}`);
      }
    }
  }

  for (const fixture of eligibleFixtures) {
    if (!registeredPaths.has(fixture)) {
      violations.push(
        `${relativeFixturePath(fixture)}: eligible SQL fixture is not registered; add it to ${REGISTRY_DISPLAY_PATH}`,
      );
    }
  }
  return violations;
}

function parseArguments(args) {
  const options = { command: null, domain: null, fixture: null, root: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--validate" || argument === "--plan") {
      if (options.command) throw new Error("choose exactly one of --validate or --plan");
      options.command = argument;
    } else if (["--domain", "--fixture", "--root"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.command) throw new Error("choose exactly one of --validate or --plan");
  return options;
}

function main(args) {
  let options;
  try {
    options = parseArguments(args);
  } catch (error) {
    console.error(`SQL fixture registry: ${error.message}`);
    console.error("usage: node scripts/ci/sql-fixture-registry.mjs (--validate|--plan) [--domain name] [--fixture name] [--root path]");
    return 2;
  }

  let registry;
  try {
    registry = loadSqlFixtureRegistry(options.root);
  } catch (error) {
    console.error(`${REGISTRY_DISPLAY_PATH}: ${error.message}`);
    return 1;
  }
  const violations = validateSqlFixtureRegistry(options.root, registry);
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    return 1;
  }
  if (options.command === "--validate") return 0;

  const selected = selectSqlFixtures(registry, options);
  if (selected.length === 0) {
    console.error("SQL fixture registry: filter matched no acceptance fixtures");
    return 1;
  }
  for (const entry of selected) {
    console.log([entry.path, entry.domain, entry.role, entry.cleanup].join("\t"));
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
