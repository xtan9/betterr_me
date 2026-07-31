import { classifyChanges, MUTATION_SCOPES } from "./classify-changes.mjs";

function unique(values) {
  return [...new Set(values)];
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

export function selectMutationTargets(records) {
  const classification = classifyChanges(records);
  const selectedScopes = new Set(classification.suites.mutationScopes);
  if (selectedScopes.size === 0) return [];

  const targets = [];
  for (const scope of MUTATION_SCOPES) {
    if (!selectedScopes.has(scope.name)) continue;

    const requiresFullScope = classification.ownershipMatches.some(
      ({ path: changedPath, owners }) =>
        owners.includes("mutation-infrastructure") ||
        (
          owners.includes(`mutation-${scope.name}`) &&
          !matchesAny(changedPath, scope.implementationPatterns)
        ),
    );
    const changedImplementations = records
      .filter((record) => !String(record.status).startsWith("D"))
      .map((record) => record.path)
      .filter((file) => matchesAny(file, scope.implementationPatterns));

    targets.push(...(
      changedImplementations.length > 0 && !requiresFullScope
        ? changedImplementations
        : scope.mutate
    ));
  }

  return unique(targets);
}

export function buildStrykerCommand(strykerBin, targets) {
  return {
    command: process.execPath,
    args: [strykerBin, "run", "--mutate", targets.join(",")],
    options: { stdio: "inherit" },
  };
}
