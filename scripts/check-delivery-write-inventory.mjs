import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const INVENTORY_PATH = "docs/architecture/delivery-write-inventory.json";

const SCOPED_SOURCE_PATTERNS = [
  /^app\/api\/(?:tasks|recurring-tasks|habits|workouts|routines|journal|projects|calendar-events|calendar|reminders|reminder-defaults)\/.+\.ts$/,
  /^app\/api\/cron\/(?:dispatch-reminders|prewarm-recurring-tasks)\/route\.ts$/,
  /^lib\/ai\/tools\/(?:tasks|habits|workouts|journal|projects|calendar|reminders)\.ts$/,
];

const RAW_WRITE_METHOD = /^(?:insert|update|upsert|delete)$/;
const DATABASE_BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+([A-Za-z_$][\w$]*)\s*\(/g;
const DIRECT_RAW_WRITE = /\b(?:supabase|adminClient|client)\s*\.\s*(?:(?:from\s*\([^)]*\))\s*\.\s*)?(insert|update|upsert|delete)\s*\(/g;
const DIRECT_RAW_RPC = /\b(?:supabase|adminClient|client)\s*\.\s*rpc\s*\(/g;
const DIRECT_DATABASE_CONSTRUCTOR_CALL = /\bnew\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
const DIRECT_DATABASE_SINGLETON_CALL = /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
const DATABASE_IMPORT = /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
const QUERY_METHOD = /^(?:get|list|find|fetch|count|calculate|has|is|exists|search|load|read|select|query|resolve|lookup|describe|preview|history|stats|summary)/i;

const WRITE_CAPABLE_DATABASE_ADAPTERS = new Set([
  "TasksDB",
  "RecurringTasksDB",
  "HabitsDB",
  "HabitLogsDB",
  "WorkoutsDB",
  "WorkoutExercisesDB",
  "RoutinesDB",
  "JournalEntriesDB",
  "JournalEntryLinksDB",
  "ProjectsDB",
  "CalendarEventsDB",
  "RemindersDB",
  "ReminderDefaultsDB",
]);

const DOMAIN_NAMES = new Set([
  "Tasks",
  "Habits",
  "Workouts",
  "Journals",
  "Projects",
  "Scheduling",
  "Reminder Configuration",
  "Reminder Delivery",
]);
const CHANNEL_NAMES = new Set(["HTTP", "AI", "Operational"]);
const REQUIRED_DOMAINS = [...DOMAIN_NAMES];

function normalizePath(filePath) {
  return String(filePath).replaceAll("\\", "/").replace(/^\.\//, "");
}

function lineNumber(contents, index) {
  return contents.slice(0, index).split("\n").length;
}

function isScopedSource(filePath) {
  const normalized = normalizePath(filePath);
  return SCOPED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function addFinding(findings, finding) {
  const existing = findings.get(finding.id);
  if (existing) {
    if (!existing.lines.includes(finding.line)) existing.lines.push(finding.line);
    return;
  }
  findings.set(finding.id, { ...finding, lines: [finding.line] });
}

function importedDatabaseBindings(contents) {
  const bindings = new Map();
  let match;
  while ((match = DATABASE_IMPORT.exec(contents)) !== null) {
    const importSource = match[2];
    if (!importSource.startsWith("@/lib/db")) continue;

    for (const rawSpecifier of match[1].split(",")) {
      const specifier = rawSpecifier.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      const [importedName, localName] = specifier
        .split(/\s+as\s+/)
        .map((value) => value.trim());
      if (WRITE_CAPABLE_DATABASE_ADAPTERS.has(importedName)) {
        bindings.set(localName || importedName, importedName);
      }
    }
  }
  return bindings;
}

function isDatabaseAdapter(className, importedBindings) {
  return className.endsWith("DB") || importedBindings.has(className);
}

function isDatabaseWriteMethod(method) {
  return !QUERY_METHOD.test(method);
}

function scanDatabaseCalls(findings, sourcePath, contents, receiver, className) {
  const receiverPattern = new RegExp(
    `\\b${receiver.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`,
    "g",
  );
  let match;
  while ((match = receiverPattern.exec(contents)) !== null) {
    const method = match[1];
    if (!isDatabaseWriteMethod(method)) continue;
    addFinding(findings, {
      id: `${sourcePath}#${className}.${method}`,
      source: sourcePath,
      operation: `${className}.${method}`,
      persistence: "database-adapter",
      method,
      className,
      line: lineNumber(contents, match.index),
    });
  }
}

/**
 * Scan one delivery-layer source file. The scanner intentionally understands
 * only write-capable database adapters and raw Supabase mutations. Calls
 * through a domain write authority (for example createTaskWrites(...).delete())
 * are not database bypasses and therefore do not match this scan. A
 * write-capable adapter remains valid when the delivery source uses it only
 * through query methods.
 */
export function scanDeliverySource(filePath, contents) {
  const sourcePath = normalizePath(filePath);
  if (!isScopedSource(sourcePath)) return [];

  const findings = new Map();
  const bindings = new Map();
  const importedBindings = importedDatabaseBindings(contents);
  let match;

  while ((match = DATABASE_BINDING.exec(contents)) !== null) {
    const receiver = match[1];
    const importedClass = importedBindings.get(match[2]);
    if (!isDatabaseAdapter(match[2], importedBindings)) continue;
    bindings.set(receiver, importedClass ?? match[2]);
  }

  for (const [receiver, className] of bindings) {
    scanDatabaseCalls(findings, sourcePath, contents, receiver, className);
  }

  while ((match = DIRECT_DATABASE_CONSTRUCTOR_CALL.exec(contents)) !== null) {
    const className = importedBindings.get(match[1]) ?? match[1];
    if (!isDatabaseAdapter(match[1], importedBindings)) continue;
    const method = match[2];
    if (!isDatabaseWriteMethod(method)) continue;
    addFinding(findings, {
      id: `${sourcePath}#${className}.${method}`,
      source: sourcePath,
      operation: `${className}.${method}`,
      persistence: "database-adapter",
      method,
      className,
      line: lineNumber(contents, match.index),
    });
  }

  while ((match = DIRECT_DATABASE_SINGLETON_CALL.exec(contents)) !== null) {
    const importedClass = importedBindings.get(match[1]);
    if (!isDatabaseAdapter(match[1], importedBindings)) continue;
    const className = importedClass ?? match[1];
    const method = match[2];
    if (bindings.has(className)) continue;
    if (!isDatabaseWriteMethod(method)) continue;
    addFinding(findings, {
      id: `${sourcePath}#${className}.${method}`,
      source: sourcePath,
      operation: `${className}.${method}`,
      persistence: "database-adapter",
      method,
      className,
      line: lineNumber(contents, match.index),
    });
  }

  while ((match = DIRECT_RAW_WRITE.exec(contents)) !== null) {
    const method = match[1];
    if (!RAW_WRITE_METHOD.test(method)) continue;
    addFinding(findings, {
      id: `${sourcePath}#raw-supabase.${method}`,
      source: sourcePath,
      operation: `Supabase.${method}`,
      persistence: "raw-supabase",
      method,
      line: lineNumber(contents, match.index),
    });
  }

  while ((match = DIRECT_RAW_RPC.exec(contents)) !== null) {
    addFinding(findings, {
      id: `${sourcePath}#raw-supabase.rpc`,
      source: sourcePath,
      operation: "Supabase.rpc",
      persistence: "raw-supabase",
      method: "rpc",
      line: lineNumber(contents, match.index),
    });
  }

  return [...findings.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function trackedSourcePaths(root) {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", "app/api", "lib/ai/tools"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
      .map(normalizePath)
      .filter(isScopedSource);
  } catch {
    return [];
  }
}

export function scanDeliverySources(root = process.cwd()) {
  return trackedSourcePaths(root)
    .flatMap((sourcePath) => {
      const absolutePath = path.join(root, sourcePath);
      return existsSync(absolutePath)
        ? scanDeliverySource(sourcePath, readFileSync(absolutePath, "utf8"))
        : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function assert(condition, message) {
  if (!condition) throw new Error(`Delivery write inventory: ${message}`);
}

function validateEntry(entry, label) {
  assert(entry && typeof entry === "object", `${label} must be an object.`);
  assert(typeof entry.id === "string" && entry.id.length > 0, `${label} needs an id.`);
  assert(DOMAIN_NAMES.has(entry.domain), `${label} has an unsupported domain.`);
  assert(typeof entry.operation === "string" && entry.operation.length > 0, `${label} needs an operation.`);
  assert(Array.isArray(entry.channels) && entry.channels.length > 0, `${label} needs delivery channels.`);
  assert(entry.channels.every((channel) => CHANNEL_NAMES.has(channel)), `${label} has an unsupported delivery channel.`);
  assert(Array.isArray(entry.invariants) && entry.invariants.length > 0, `${label} needs invariants.`);
  assert(typeof entry.atomicity === "string" && entry.atomicity.length > 0, `${label} needs atomicity guidance.`);
  assert(typeof entry.migrationStatus === "string" && entry.migrationStatus.length > 0, `${label} needs migration status.`);
  assert(typeof entry.owningTicket === "string" && /#\d+/.test(entry.owningTicket), `${label} needs an owning ticket reference.`);
  assert(typeof entry.evidence === "string" && entry.evidence.length > 0, `${label} needs source evidence.`);
}

function validateOutOfScope(outOfScope, index) {
  const label = `outOfScope ${index}`;
  assert(outOfScope && typeof outOfScope === "object", `${label} must be an object.`);
  assert(typeof outOfScope.id === "string" && outOfScope.id.length > 0, `${label} needs an id.`);
  assert(Array.isArray(outOfScope.paths) && outOfScope.paths.length > 0, `${label} needs source paths.`);
  assert(outOfScope.paths.every((sourcePath) => typeof sourcePath === "string" && sourcePath.length > 0), `${label} needs valid source paths.`);
  assert(typeof outOfScope.reason === "string" && outOfScope.reason.length > 0, `${label} needs a reason.`);
}

function validateVerification(entry, label, root) {
  assert(entry.verification && typeof entry.verification === "object", `${label} needs verification evidence.`);
  assert(entry.verification.status === "complete", `${label} verification must be complete.`);
  assert(Array.isArray(entry.verification.tests) && entry.verification.tests.length > 0, `${label} needs verification tests.`);
  assert(entry.verification.tests.every((testPath) => {
    return typeof testPath === "string" && testPath.length > 0 && existsSync(path.join(root, testPath));
  }), `${label} references a missing verification test.`);
  assert(typeof entry.verification.importBoundary === "string" && entry.verification.importBoundary.length > 0, `${label} needs an import-boundary verification link.`);
  assert(existsSync(path.join(root, entry.verification.importBoundary)), `${label} references a missing import-boundary verification.`);
  assert(Array.isArray(entry.verification.sqlFixtures), `${label} needs a SQL fixture evidence list.`);
  assert(entry.verification.sqlFixtures.every((fixturePath) => {
    return typeof fixturePath === "string" && fixturePath.length > 0 && existsSync(path.join(root, fixturePath));
  }), `${label} references a missing SQL fixture.`);
}

export function validateDeliveryWriteInventory({ inventory, findings, root = process.cwd() }) {
  assert(inventory && inventory.schemaVersion === 2, "schemaVersion must be 2.");
  assert(inventory.review && typeof inventory.review === "object", "review must be an object.");
  assert(typeof inventory.review.reviewedAt === "string" && inventory.review.reviewedAt.length > 0, "review needs a review date.");
  assert(typeof inventory.review.policy === "string" && inventory.review.policy.length > 0, "review needs a policy.");
  assert(typeof inventory.review.owningTicket === "string" && /#\d+/.test(inventory.review.owningTicket), "review needs an owning ticket reference.");
  assert(Array.isArray(inventory.entries), "entries must be an array.");
  assert(inventory.entries.length === 0, "temporary direct-write exceptions must be empty.");
  assert(Array.isArray(inventory.priorArt), "priorArt must be an array.");
  assert(Array.isArray(inventory.outOfScope), "outOfScope must be an array.");
  for (const forbiddenKey of [
    "baseline",
    "allowlist",
    "migrationAllowlist",
    "temporaryBaseline",
  ]) {
    const message =
      forbiddenKey === "baseline"
        ? "baseline is not permitted."
        : "migration allowlists are not permitted.";
    assert(!Object.hasOwn(inventory, forbiddenKey), message);
  }
  inventory.outOfScope.forEach(validateOutOfScope);

  const entries = new Map();
  for (const entry of inventory.entries) {
    validateEntry(entry, `entry ${entry?.id ?? "<unknown>"}`);
    assert(!entries.has(entry.id), `duplicate entry ${entry.id}.`);
    entries.set(entry.id, entry);
    assert(entry.migrationStatus === "remaining", `direct-write entry ${entry.id} must be marked remaining.`);
  }

  const priorArtIds = new Set();
  for (const priorArt of inventory.priorArt) {
    validateEntry(priorArt, `prior-art ${priorArt?.id ?? "<unknown>"}`);
    assert(!entries.has(priorArt.id) && !priorArtIds.has(priorArt.id), `duplicate prior-art id ${priorArt.id}.`);
    priorArtIds.add(priorArt.id);
    assert(priorArt.migrationStatus === "migrated", `prior-art ${priorArt.id} must be marked migrated.`);
    assert(typeof priorArt.authority === "string" && priorArt.authority.length > 0, `prior-art ${priorArt.id} needs an authority.`);
    if (priorArt.retiredFromInventory === true) {
      validateVerification(priorArt, `prior-art ${priorArt.id}`, root);
    }
  }

  const coveredDomains = new Set([
    ...inventory.entries.map((entry) => entry.domain),
    ...inventory.priorArt.map((entry) => entry.domain),
  ]);
  const uncoveredDomains = REQUIRED_DOMAINS.filter((domain) => !coveredDomains.has(domain));
  assert(uncoveredDomains.length === 0, `inventory does not cover domain(s): ${uncoveredDomains.join(", ")}.`);

  assert(Array.isArray(findings), "architecture findings must be an array.");
  assert(findings.length === 0, `qualifying delivery mutation bypass(es) remain: ${findings.map((finding) => finding.id).join(", ")}.`);

  return {
    directWrites: findings.length,
    migratedPriorArt: inventory.priorArt.length,
    outOfScopeWrites: inventory.outOfScope.length,
  };
}

export function checkDeliveryWriteInventory(root = process.cwd()) {
  const inventory = JSON.parse(readFileSync(path.join(root, INVENTORY_PATH), "utf8"));
  const findings = scanDeliverySources(root);
  return validateDeliveryWriteInventory({ inventory, findings, root });
}

function main() {
  try {
    const result = checkDeliveryWriteInventory();
    console.log(
      `Delivery mutation boundaries passed: ${result.directWrites} qualifying bypasses, ${result.migratedPriorArt} verified authorities, ${result.outOfScopeWrites} out-of-scope writes.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
