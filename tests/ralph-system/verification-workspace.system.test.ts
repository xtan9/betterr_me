import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createVerificationWorkspace } from "../../scripts/ralph/v2/verification-workspace.mjs";
import { git } from "./support/git-world";

const roots: string[] = [];

function createCase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-clean-view-"));
  roots.push(root);
  const repositoryPath = path.join(root, "candidate-repository");
  const workspaceRoot = path.join(root, "verification-workspaces");
  const trustedDependencyRoot = path.join(root, "trusted-dependencies");
  fs.mkdirSync(repositoryPath, { recursive: true });
  fs.mkdirSync(trustedDependencyRoot, { recursive: true });
  git(repositoryPath, ["init", "--initial-branch=main"]);
  git(repositoryPath, ["config", "user.name", "Ralph Test"]);
  git(repositoryPath, ["config", "user.email", "ralph@example.invalid"]);
  fs.writeFileSync(path.join(repositoryPath, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(repositoryPath, "candidate.txt"), "base\n");
  git(repositoryPath, ["add", "--all"]);
  git(repositoryPath, ["commit", "-m", "base"]);
  const baseSha = git(repositoryPath, ["rev-parse", "HEAD"]).stdout.trim();

  fs.writeFileSync(path.join(repositoryPath, "candidate.txt"), "candidate\n");
  git(repositoryPath, ["add", "candidate.txt"]);
  const candidateTreeSha = git(repositoryPath, ["write-tree"]).stdout.trim();
  const poisonedDependencyPath = path.join(
    repositoryPath,
    "node_modules",
    ".bin",
    "vitest",
  );
  fs.mkdirSync(path.dirname(poisonedDependencyPath), { recursive: true });
  fs.writeFileSync(poisonedDependencyPath, "worker-controlled\n");
  fs.writeFileSync(
    path.join(trustedDependencyRoot, "trusted-marker.txt"),
    "controller-owned\n",
  );

  return {
    root,
    repositoryPath,
    workspaceRoot,
    trustedDependencyRoot,
    baseSha,
    candidateTreeSha,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 exact-tree verification workspace", () => {
  it("materializes only the candidate tree and controller-owned dependencies", () => {
    const testCase = createCase();
    const workspace = createVerificationWorkspace({
      repositoryPath: testCase.repositoryPath,
      workspaceRoot: testCase.workspaceRoot,
      trustedDependencyRoot: testCase.trustedDependencyRoot,
    });

    const prepared = workspace.prepare({
      sessionId: "ralph-v2:issue-815:generation-1:verification",
      baseSha: testCase.baseSha,
      candidateTreeSha: testCase.candidateTreeSha,
    });

    expect(prepared.candidateTreeSha).toBe(testCase.candidateTreeSha);
    expect(
      git(prepared.worktreePath, ["write-tree"]).stdout.trim(),
    ).toBe(testCase.candidateTreeSha);
    expect(fs.readFileSync(path.join(prepared.worktreePath, "candidate.txt"), "utf8")).toBe(
      "candidate\n",
    );
    expect(
      fs.existsSync(
        path.join(prepared.worktreePath, "node_modules", ".bin", "vitest"),
      ),
    ).toBe(false);
    expect(
      fs.readFileSync(
        path.join(prepared.worktreePath, "node_modules", "trusted-marker.txt"),
        "utf8",
      ),
    ).toBe("controller-owned\n");
    expect(
      fs.realpathSync.native(path.join(prepared.worktreePath, "node_modules")),
    ).toBe(fs.realpathSync.native(testCase.trustedDependencyRoot));
    expect(
      fs.readFileSync(path.join(prepared.worktreePath, ".git", "config"), "utf8"),
    ).not.toContain(testCase.repositoryPath);

    const recovered = workspace.prepare({
      sessionId: "ralph-v2:issue-815:generation-1:verification",
      baseSha: testCase.baseSha,
      candidateTreeSha: testCase.candidateTreeSha,
    });
    expect(recovered).toEqual(prepared);

    workspace.cleanup(prepared);
    expect(fs.existsSync(prepared.worktreePath)).toBe(false);
  });
});
