import { classifyVercelBuild } from "./vercel-ignore-build.mjs";

const NON_RUNTIME_REASON =
  "Only non-runtime files changed; a preview is not requested by default.";
const CHECKS_REASON =
  "The exact commit must pass CI Gate and E2E Gate before preview dispatch.";

/**
 * @param {{
 *   alreadyDispatched?: boolean,
 *   changedFiles?: string[],
 *   ciStatus?: string,
 *   e2eStatus?: string,
 *   fork?: boolean,
 *   forkAuthorized?: boolean,
 *   requestedSha?: string,
 *   testedSha?: string,
 * }} options
 */
export function planPreviewDeployment({
  alreadyDispatched = false,
  changedFiles,
  ciStatus,
  e2eStatus,
  fork = false,
  forkAuthorized = false,
  requestedSha,
  testedSha,
} = {}) {
  const selection = classifyVercelBuild(changedFiles ?? []);
  const result = {
    changedFiles: selection.files,
    runtimeFiles: selection.runtimeFiles,
  };

  if (alreadyDispatched) {
    return {
      action: "skip",
      reason: "A preview has already been dispatched for this commit.",
      ...result,
    };
  }

  if (fork && !forkAuthorized) {
    return {
      action: "skip",
      reason: "Fork pull requests require explicit preview authorization.",
      ...result,
    };
  }

  const dispatchAuthorizationRequested =
    requestedSha !== undefined ||
    testedSha !== undefined ||
    ciStatus !== undefined ||
    e2eStatus !== undefined;
  if (
    dispatchAuthorizationRequested &&
    (!requestedSha || !testedSha || requestedSha !== testedSha)
  ) {
    return {
      action: "skip",
      reason: "The requested preview commit must exactly match the tested commit.",
      ...result,
    };
  }

  if (selection.files.length === 0) {
    return {
      action: "skip",
      reason: "No changed files were classified; a preview is not requested by default.",
      ...result,
    };
  }

  if (!selection.build) {
    return { action: "skip", reason: NON_RUNTIME_REASON, ...result };
  }

  if (
    (ciStatus !== undefined && ciStatus !== "success") ||
    (e2eStatus !== undefined && e2eStatus !== "success")
  ) {
    return { action: "skip", reason: CHECKS_REASON, ...result };
  }

  return {
    action: "request",
    reason: "Runtime application changes warrant a preview.",
    ...result,
  };
}
