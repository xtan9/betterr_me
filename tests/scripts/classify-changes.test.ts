import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryRepositories: string[] = [];
const bashExecutable = process.platform === "win32"
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";

function git(repository: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function createRepositoryWithGlobalConfigChange(
  file = "package.json",
  initialContents = "{}\n",
  changedContents = '{"private":true}\n',
) {
  const repository = mkdtempSync(join(tmpdir(), "better-me-ci-classifier-"));
  temporaryRepositories.push(repository);

  cpSync(resolve("scripts/ci"), join(repository, "scripts/ci"), {
    recursive: true,
  });
  git(repository, "init", "--quiet");
  git(repository, "config", "user.email", "ci@example.test");
  git(repository, "config", "user.name", "CI Test");
  writeFileSync(join(repository, file), initialContents);
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "base");
  const baseSha = git(repository, "rev-parse", "HEAD");

  writeFileSync(join(repository, file), changedContents);
  git(repository, "add", file);
  git(repository, "commit", "--quiet", "-m", "change package config");

  return {
    repository,
    baseSha,
    headSha: git(repository, "rev-parse", "HEAD"),
  };
}

function classifyPush(
  validatedByPullRequest: boolean,
  file = "package.json",
  initialContents = "{}\n",
  changedContents = '{"private":true}\n',
) {
  const { repository, baseSha, headSha } =
    createRepositoryWithGlobalConfigChange(
      file,
      initialContents,
      changedContents,
    );
  const outputPath = join(repository, "github-output.txt");

  execFileSync(bashExecutable, ["scripts/ci/classify-changes.sh"], {
    cwd: repository,
    env: {
      ...process.env,
      BASE_SHA: baseSha,
      EVENT_NAME: "push",
      GITHUB_OUTPUT: outputPath,
      HEAD_SHA: headSha,
      VALIDATED_BY_PULL_REQUEST: String(validatedByPullRequest),
    },
  });

  return Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=", 2)),
  );
}

function classifyManualDispatch() {
  const repository = mkdtempSync(join(tmpdir(), "better-me-ci-classifier-"));
  temporaryRepositories.push(repository);

  cpSync(resolve("scripts/ci"), join(repository, "scripts/ci"), {
    recursive: true,
  });
  const outputPath = join(repository, "github-output.txt");

  execFileSync(bashExecutable, ["scripts/ci/classify-changes.sh"], {
    cwd: repository,
    env: {
      ...process.env,
      EVENT_NAME: "workflow_dispatch",
      GITHUB_OUTPUT: outputPath,
    },
  });

  return Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=", 2)),
  );
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

describe("CI change classification", () => {
  it("runs the full Chromium E2E suite for a manual dispatch", () => {
    expect(classifyManualDispatch()).toMatchObject({
      e2e: "true",
      e2e_full: "true",
      e2e_label: "full Chromium",
      e2e_specs: "",
    });
  });

  it("skips duplicate quality checks for a push already validated by a pull request", () => {
    expect(classifyPush(true)).toMatchObject({
      quality: "false",
      full_tests: "false",
      full_lint: "false",
      changed_tests: "false",
      migrations: "false",
    });
  });

  it("retains full quality checks for a direct push", () => {
    expect(classifyPush(false)).toMatchObject({
      quality: "true",
      full_tests: "true",
      full_lint: "true",
    });
  });

  it("treats pnpm workspace policy as global CI and build configuration", () => {
    expect(classifyPush(
      false,
      "pnpm-workspace.yaml",
      "allowBuilds: {}\n",
      "allowBuilds:\n  esbuild: true\n",
    )).toMatchObject({
      quality: "true",
      full_tests: "true",
      full_lint: "true",
      e2e: "true",
      e2e_full: "true",
      performance: "true",
    });
  });
});
