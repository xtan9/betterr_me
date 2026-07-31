import { pathToFileURL } from "node:url";

const completedResults = new Set(["success", "failure", "cancelled", "skipped"]);

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

/**
 * Fail-closed policy shared by the CI Gate and E2E Gate aggregate jobs.
 *
 * @param {{
 *   gateName: string,
 *   selectionResult: string,
 *   classificationJson: string,
 *   prerequisites: Array<{ name: string, suite: string, result: string }>,
 * }} policy
 */
export function verifyGate({
  gateName,
  selectionResult,
  classificationJson,
  prerequisites,
}) {
  if (selectionResult !== "success") {
    throw new Error(
      `${gateName} requires change selection to report success; received ${selectionResult || "missing"}`,
    );
  }

  const classification = parseJson(classificationJson, "CLASSIFICATION_JSON");
  if (!classification?.suites || typeof classification.suites !== "object") {
    throw new Error(`${gateName} requires classification suites`);
  }
  if (!Array.isArray(prerequisites) || prerequisites.length === 0) {
    throw new Error(`${gateName} requires at least one prerequisite`);
  }

  const selected = [];
  const skipped = [];
  for (const prerequisite of prerequisites) {
    const isSelected = classification.suites[prerequisite.suite];
    if (typeof isSelected !== "boolean") {
      throw new Error(
        `${gateName} requires ${prerequisite.name} selection to be a boolean`,
      );
    }
    if (!completedResults.has(prerequisite.result)) {
      throw new Error(
        `${gateName} requires ${prerequisite.name} to report a completed result; received ${prerequisite.result || "missing"}`,
      );
    }

    const expectedResult = isSelected ? "success" : "skipped";
    if (prerequisite.result !== expectedResult) {
      throw new Error(
        `${gateName} requires ${prerequisite.name} to report ${expectedResult}; received ${prerequisite.result}`,
      );
    }
    (isSelected ? selected : skipped).push(prerequisite.name);
  }

  return { gateName, selected, skipped };
}

export function verifyGateFromEnvironment(env = process.env) {
  const prerequisites = parseJson(
    env.PREREQUISITES_JSON ?? "",
    "PREREQUISITES_JSON",
  );
  const result = verifyGate({
    gateName: env.GATE_NAME || "Workflow gate",
    selectionResult: env.SELECTION_RESULT ?? "",
    classificationJson: env.CLASSIFICATION_JSON ?? "",
    prerequisites,
  });

  console.log(`${result.gateName} passed.`);
  console.log(`selected work: ${result.selected.join(", ") || "none"}`);
  console.log(`skipped by policy: ${result.skipped.join(", ") || "none"}`);
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    verifyGateFromEnvironment();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
