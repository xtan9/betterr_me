import { execFileSync } from "node:child_process";

import {
  classifyVercelBuild,
  parseVercelChangedPaths,
} from "./vercel-ignore-build.mjs";

const REQUIRED_E2E_GATE = "E2E Gate";

export function changedFilesForCommit(sha) {
  if (!sha) throw new Error("A deployment commit SHA is required");
  return parseVercelChangedPaths(
    execFileSync(
      "git",
      ["diff", "--name-status", "-z", "--no-renames", `${sha}^`, sha],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
}

export function planProductionDeployment({
  changedFiles,
  currentMainSha,
  e2eStatus,
  triggerSha,
}) {
  const selection = classifyVercelBuild(changedFiles);

  if (!selection.build) {
    return {
      action: "skip",
      reason: "Only non-runtime files changed.",
      changedFiles: selection.files,
      runtimeFiles: selection.runtimeFiles,
    };
  }

  if (triggerSha !== currentMainSha) {
    return {
      action: "skip",
      reason: "A newer main commit superseded this deployment.",
      changedFiles: selection.files,
      runtimeFiles: selection.runtimeFiles,
    };
  }

  if (e2eStatus !== "success") {
    throw new Error(
      `Production deployment requires ${REQUIRED_E2E_GATE} to succeed; ` +
        `received ${e2eStatus || "missing"}`,
    );
  }

  return {
    action: "deploy",
    reason:
      "Runtime changes passed CI, database migration, and E2E prerequisites.",
    changedFiles: selection.files,
    runtimeFiles: selection.runtimeFiles,
  };
}

function exactGateStatus(checkRuns) {
  const matches = Array.isArray(checkRuns)
    ? checkRuns.filter((check) => check?.name === REQUIRED_E2E_GATE)
    : [];
  if (matches.length > 1) {
    throw new Error(
      `Production deployment found ambiguous ${REQUIRED_E2E_GATE} results`,
    );
  }
  const gate = matches[0];
  return gate?.status === "completed"
    ? gate.conclusion || "missing"
    : gate?.status || "missing";
}

export async function authorizeProductionDeployment({
  changedFiles,
  getCurrentMainSha,
  listCheckRuns,
  maxAttempts = 120,
  sha,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const selection = classifyVercelBuild(changedFiles);
  if (!selection.build) {
    return planProductionDeployment({
      changedFiles,
      currentMainSha: sha,
      e2eStatus: "success",
      triggerSha: sha,
    });
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const currentMainSha = await getCurrentMainSha();
    if (currentMainSha !== sha) {
      return planProductionDeployment({
        changedFiles,
        currentMainSha,
        e2eStatus: "success",
        triggerSha: sha,
      });
    }

    const e2eStatus = exactGateStatus(await listCheckRuns());
    if (
      ["failure", "cancelled", "timed_out", "action_required"].includes(
        e2eStatus,
      )
    ) {
      return planProductionDeployment({
        changedFiles,
        currentMainSha,
        e2eStatus,
        triggerSha: sha,
      });
    }
    if (e2eStatus === "success") {
      return planProductionDeployment({
        changedFiles,
        currentMainSha: await getCurrentMainSha(),
        e2eStatus,
        triggerSha: sha,
      });
    }

    await sleep(10_000);
  }

  throw new Error(`Timed out waiting for ${REQUIRED_E2E_GATE} on ${sha}`);
}
