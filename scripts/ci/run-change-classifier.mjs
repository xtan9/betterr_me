import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function emergencyBroadClassification(error) {
  return {
    changedPaths: [],
    ownershipMatches: [],
    suites: {
      quality: true,
      fullTests: true,
      fullLint: true,
      changedTests: false,
      smokeTests: [],
      migrations: true,
      e2e: true,
      e2eFull: true,
      e2eSpecs: [],
      e2eRunway: true,
      e2eVisual: true,
      e2eSupabase: true,
      performance: true,
    },
    labels: { quality: "full suite", e2e: "full Chromium + finance + visual regression" },
    reasons: [`classifier startup error: ${error}; running broad validation.`],
    skipReasons: {
      changedTests: "The complete unit-test suite supersedes changed-test selection.",
      smokeTests: "The complete unit-test suite supersedes CI smoke tests.",
      e2eSpecs: "Full Chromium coverage supersedes individual Chromium spec selection.",
    },
    fallback: true,
  };
}

function emergencyOutputs(result, baseSha) {
  return `base_sha=${baseSha ?? ""}\nclassification_json=${JSON.stringify(result)}`;
}

export async function runChangeClassifier({
  env = process.env,
  loadClassifier = () => import("./classify-changes.mjs"),
  write = (outputs) => {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${outputs}\n`);
    else console.log(outputs);
  },
  log = console.log,
} = {}) {
  let result;
  let outputs;
  try {
    const classifier = await loadClassifier();
    result = classifier.classifyComparison({
      eventName: env.EVENT_NAME,
      baseSha: env.BASE_SHA,
      headSha: env.HEAD_SHA,
      validatedByPullRequest: env.VALIDATED_BY_PULL_REQUEST === "true",
    });
    outputs = classifier.formatGitHubOutputs(result, env.BASE_SHA ?? "");
  } catch (error) {
    result = emergencyBroadClassification(
      error instanceof Error ? error.message : String(error),
    );
    outputs = emergencyOutputs(result, env.BASE_SHA);
  }

  log("Conditional test classification:");
  log(JSON.stringify(result, null, 2));
  write(outputs);
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runChangeClassifier();
}
