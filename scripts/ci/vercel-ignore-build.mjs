import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Only paths known to have no effect on the deployed Next.js application are
// skipped. New or unfamiliar paths intentionally trigger a build.
const NON_RUNTIME_PATTERNS = [
  /^(?:\.agents|\.claude|\.github|\.planning|\.superpowers)\//,
  /^(?:docs|e2e|scripts|supabase|tests)\//,
  /^(?:AGENTS|CLAUDE|README)\.md$/,
  /^\.env\.example$/,
  /^\.(?:gitattributes|gitignore)$/,
  /^components\.json$/,
  /^eslint\.config\.mjs$/,
  /^lighthouserc\.js$/,
  /^next-env\.d\.ts$/,
  /^playwright\.config\.ts$/,
  /^skills-lock\.json$/,
  /^stryker\.config\.mjs$/,
  /^vitest\.config\.ts$/,
];

function normalizeFiles(changedFiles) {
  const files = Array.isArray(changedFiles)
    ? changedFiles
    : String(changedFiles).split(/\r?\n/);

  return files
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

export function classifyVercelBuild(changedFiles) {
  const files = normalizeFiles(changedFiles);
  const runtimeFiles = files.filter(
    (file) => !NON_RUNTIME_PATTERNS.some((pattern) => pattern.test(file)),
  );

  return {
    build: files.length === 0 || runtimeFiles.length > 0,
    files,
    runtimeFiles,
  };
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commitExists(sha) {
  if (!sha) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function changedFilesForVercel(env = process.env) {
  const currentSha = env.VERCEL_GIT_COMMIT_SHA?.trim() || git(["rev-parse", "HEAD"]);
  let previousSha = env.VERCEL_GIT_PREVIOUS_SHA?.trim();

  if (!commitExists(previousSha)) {
    previousSha = git(["rev-parse", `${currentSha}^`]);
  }

  if (!commitExists(currentSha) || !commitExists(previousSha)) {
    throw new Error("comparison commits are unavailable in the Vercel checkout");
  }

  return git([
    "diff",
    "--name-only",
    "--diff-filter=ACMRTUXB",
    previousSha,
    currentSha,
  ]).split(/\r?\n/).filter(Boolean);
}

function printPaths(label, files) {
  console.log(`${label}: ${files.length > 0 ? files.join(", ") : "none"}`);
}

async function main() {
  try {
    const selection = classifyVercelBuild(changedFilesForVercel());
    printPaths("Changed files", selection.files);

    if (selection.build) {
      printPaths("Build-affecting files", selection.runtimeFiles);
      console.log("Vercel build will continue.");
      process.exitCode = 1;
      return;
    }

    console.log("Only non-runtime files changed; Vercel build will be skipped.");
    process.exitCode = 0;
  } catch (error) {
    console.warn(`Unable to classify Vercel changes: ${error.message}`);
    console.warn("Failing open so the Vercel build continues.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
