import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const INFRASTRUCTURE_CONCLUSIONS = new Set([
  "action_required",
  "stale",
  "startup_failure",
]);

export function scheduledFailureDiagnostic(conclusion) {
  if (conclusion === "timed_out") return "timeout";
  if (conclusion === "cancelled") return "cancellation";
  if (INFRASTRUCTURE_CONCLUSIONS.has(conclusion)) {
    return "infrastructure interruption";
  }
  if (conclusion === "success") return "success";
  return "failure";
}

export function resolveMutationConclusion({
  reportedConclusion,
  stepOutcome,
  runCancelled,
}) {
  if (runCancelled === "true") return "cancelled";
  if (reportedConclusion) return reportedConclusion;
  if (stepOutcome === "cancelled") return "timed_out";
  if (["success", "failure"].includes(stepOutcome)) return stepOutcome;
  return "startup_failure";
}

function diagnosticDetail(category) {
  if (category === "success") {
    return "The declared full mutation scope completed within its command budget.";
  }
  if (category === "failure") {
    return "Stryker returned a non-zero result; inspect its output and HTML report.";
  }
  if (category === "timeout") {
    return "The mutation command exceeded its declared 50-minute limit.";
  }
  if (category === "cancellation") {
    return "GitHub cancelled the workflow before mutation testing completed.";
  }
  return "The mutation step did not produce a normal GitHub Actions result.";
}

export function mutationDiagnostic({
  reportedConclusion,
  stepOutcome,
  runCancelled,
}) {
  const conclusion = resolveMutationConclusion({
    reportedConclusion,
    stepOutcome,
    runCancelled,
  });
  const category = scheduledFailureDiagnostic(conclusion);
  return { conclusion, category, detail: diagnosticDetail(category) };
}

async function main() {
  const diagnostic = mutationDiagnostic({
    reportedConclusion: process.env.MUTATION_CONCLUSION,
    stepOutcome: process.env.MUTATION_OUTCOME,
    runCancelled: process.env.RUN_CANCELLED,
  });
  const summary = [
    "## Full mutation diagnostic",
    "",
    `Category: ${diagnostic.category}`,
    "",
    diagnostic.detail,
    "",
    `Mutation conclusion: \`${diagnostic.conclusion}\``,
    "",
  ].join("\n");

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  process.stdout.write(`Category: ${diagnostic.category}\n${diagnostic.detail}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
