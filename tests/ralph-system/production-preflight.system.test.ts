import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertProductionPreflight } from "../../scripts/ralph/v2/production-preflight.mjs";

describe("Ralph v2 production preflight", () => {
  it("proves clean latest main, authenticated controller tools, WSL systemd, and no legacy owner", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-preflight-"));
    try {
      const repositoryPath = path.join(root, "repository");
      const runtimePath = path.join(root, "runtime");
      const legacyRuntimeRoot = path.join(root, "legacy");
      for (const directory of [repositoryPath, runtimePath, legacyRuntimeRoot]) {
        fs.mkdirSync(directory, { recursive: true });
      }
      const commands: string[] = [];
      const execute = (executable: string, args: string[]) => {
        commands.push([executable, ...args].join(" "));
        const command = args.join(" ");
        if (command.includes("status --porcelain")) return { status: 0, stdout: "", stderr: "" };
        if (command.includes("branch --show-current")) return { status: 0, stdout: "main\n", stderr: "" };
        if (command.includes("rev-parse HEAD") || command.includes("rev-parse origin/main")) {
          return { status: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
        }
        if (command.includes("remote get-url origin")) {
          return { status: 0, stdout: "git@github.com:owner/repository.git\n", stderr: "" };
        }
        if (command.includes("systemctl is-system-running")) {
          return { status: 0, stdout: "running\n", stderr: "" };
        }
        return { status: 0, stdout: "ok\n", stderr: "" };
      };
      expect(assertProductionPreflight({
        repositoryPath,
        runtimePath,
        githubRepository: "owner/repository",
        legacyRuntimeRoot,
        execute,
        processIsAlive: () => false,
      })).toMatchObject({ headSha: "a".repeat(40), branch: "main" });
      expect(commands).toEqual(expect.arrayContaining([
        expect.stringMatching(/git.*fetch.*origin.*main/i),
        expect.stringMatching(/gh.*auth status/i),
        expect.stringMatching(/wsl.*systemctl is-system-running/i),
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a live legacy Ralph controller", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-preflight-live-"));
    try {
      const repositoryPath = path.join(root, "repository");
      const runtimePath = path.join(root, "runtime");
      const legacyRuntimeRoot = path.join(root, "legacy");
      for (const directory of [repositoryPath, runtimePath, legacyRuntimeRoot]) {
        fs.mkdirSync(directory, { recursive: true });
      }
      fs.writeFileSync(path.join(legacyRuntimeRoot, "runner.lock"), JSON.stringify({ pid: 1234 }));
      expect(() => assertProductionPreflight({
        repositoryPath,
        runtimePath,
        githubRepository: "owner/repository",
        legacyRuntimeRoot,
        execute: () => ({ status: 0, stdout: "", stderr: "" }),
        processIsAlive: (pid: number) => pid === 1234,
      })).toThrow(/legacy Ralph controller/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
