import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWslSandboxProbePlan,
  windowsToWslPath,
} from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ADVERSARY_SOURCE_PATH = fileURLToPath(
  new URL("./fixtures/wsl-sandbox-adversary.mjs", import.meta.url),
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  }
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 WSL worker sandbox",
  () => {
    it("denies controller credentials and Windows interop while preserving approved work", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-wsl-sandbox-"));
      roots.push(root);
      const worktreePath = path.join(root, "worktree");
      fs.mkdirSync(worktreePath, { recursive: true });
      const adversaryPath = path.join(worktreePath, "adversary.mjs");
      const workspaceMaterialPath = path.join(worktreePath, "material.txt");
      const workspaceOutputPath = path.join(worktreePath, "output.txt");
      fs.copyFileSync(ADVERSARY_SOURCE_PATH, adversaryPath);
      fs.writeFileSync(workspaceMaterialPath, "approved\n");
      expect(fs.existsSync(path.join(REPOSITORY_ROOT, "package.json"))).toBe(true);
      expect(
        fs.existsSync(path.join(process.env.USERPROFILE ?? "", ".codex", "auth.json")),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            process.env.SystemRoot ?? process.env.WINDIR ?? "",
            "System32",
            "cmd.exe",
          ),
        ),
      ).toBe(true);
      const linuxCredentialPreflight = spawnSync(
        path.join(
          process.env.SystemRoot ?? process.env.WINDIR ?? "",
          "System32",
          "wsl.exe",
        ),
        [
          "--",
          "test",
          "-f",
          "/var/lib/betterr-me-ralph/codex-runtime/auth.json",
        ],
        { windowsHide: true },
      );
      expect(linuxCredentialPreflight.status).toBe(0);

      const plan = createWslSandboxProbePlan({
        worktreePath,
        command: "/usr/local/bin/node",
        args: [
          adversaryPath,
          JSON.stringify({
            workspaceMaterialPath: windowsToWslPath(workspaceMaterialPath),
            workspaceOutputPath: windowsToWslPath(workspaceOutputPath),
            dependencyMaterialPath:
              "/var/lib/betterr-me-ralph/deps-source/node_modules/vitest/package.json",
            controllerMaterialPath: windowsToWslPath(
              path.join(REPOSITORY_ROOT, "package.json"),
            ),
            linuxCredentialPath:
              "/var/lib/betterr-me-ralph/codex-runtime/auth.json",
            windowsCredentialPath: windowsToWslPath(
              path.join(process.env.USERPROFILE ?? "", ".codex", "auth.json"),
            ),
          }),
        ],
      });
      const result = spawnSync(plan.executable, plan.args, {
        cwd: plan.cwd,
        encoding: "utf8",
        env: plan.environment,
        timeout: 30_000,
        windowsHide: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status, result.stderr).toBe(0);
      const evidence = JSON.parse(result.stdout.trim());

      expect(evidence.identity).toEqual({
        uid: "65534\t65534\t65534\t65534",
        gid: "65534\t65534\t65534\t65534",
        groups: "",
        capEffective: "0000000000000000",
        capBounding: "0000000000000000",
        noNewPrivileges: "1",
      });
      expect(evidence.workspaceRead).toEqual({
        readable: true,
        errorCode: null,
      });
      expect(evidence.workspaceWrite).toEqual({
        writable: true,
        errorCode: null,
      });
      expect(evidence.dependencyRead).toEqual({
        readable: true,
        errorCode: null,
      });
      for (const denied of [
        evidence.controllerRead,
        evidence.linuxCredentialRead,
        evidence.windowsCredentialRead,
      ]) {
        expect(denied).toEqual({
          readable: false,
          errorCode: expect.stringMatching(/^(?:EACCES|EPERM|ENOENT)$/),
        });
      }
      expect(evidence.windowsInterop).toEqual({
        status: null,
        signal: null,
        errorCode: expect.stringMatching(/^(?:EACCES|EPERM|ENOENT)$/),
      });
      expect(fs.readFileSync(workspaceOutputPath, "utf8")).toBe(
        "sandbox-write-probe\n",
      );
    });
  },
);
