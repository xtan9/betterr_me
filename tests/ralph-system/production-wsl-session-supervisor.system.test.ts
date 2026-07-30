import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { unprivilegedWslCommandArguments } from "../../scripts/ralph/worker-isolation.mjs";
import { createProductionSessionSupervisor } from "../../scripts/ralph/v2/production-session-supervisor.mjs";
import { computeSessionPlanDigest } from "../../scripts/ralph/v2/session-supervisor.mjs";
import {
  createWslSystemdChildPlan,
  inspectWslSystemdUnit,
} from "../../scripts/ralph/v2/wsl-systemd-containment.mjs";
import { windowsToWslPath } from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";

const SUCCESS_SOURCE = fileURLToPath(
  new URL("./fixtures/wsl-systemd-success.mjs", import.meta.url),
);
const roots: string[] = [];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMilliseconds = 15_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`);
    await sleep(50);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20 });
  }
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 production WSL session supervision",
  () => {
    it("runs one durable Linux session and reattaches without duplication", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-production-wsl-"));
      roots.push(root);
      const worktreePath = path.join(root, "worktree");
      const sessionRoot = path.join(root, "sessions");
      const containmentBase = path.join(root, "containment");
      fs.mkdirSync(worktreePath, { recursive: true });
      fs.mkdirSync(sessionRoot, { recursive: true });
      fs.mkdirSync(containmentBase, { recursive: true });
      const successPath = path.join(worktreePath, path.basename(SUCCESS_SOURCE));
      fs.copyFileSync(SUCCESS_SOURCE, successPath);
      const sessionId = "ralph-v2:production-wsl:success";
      const supervisor = createProductionSessionSupervisor({
        sessionRoot,
        containmentRoot: containmentBase,
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 30_000,
        trustedWslBridge: true,
      });
      const containmentRoot = supervisor.containmentRootFor(sessionId);
      const linuxLaunch = unprivilegedWslCommandArguments({
        home: "/var/lib/betterr-me-ralph/worker-home",
        command: "/usr/local/bin/node",
        args: [windowsToWslPath(successPath), windowsToWslPath(worktreePath)],
      });
      const systemd = createWslSystemdChildPlan({
        containmentRoot,
        sessionId,
        runtimeTimeoutSeconds: 30,
        child: {
          executable: linuxLaunch[0],
          args: linuxLaunch.slice(1),
          cwd: windowsToWslPath(worktreePath),
          environment: {},
        },
      });
      const planDigest = computeSessionPlanDigest({
        sessionId,
        child: systemd.windowsChild,
      });
      await supervisor.plan({ sessionId, planDigest, child: systemd.windowsChild });
      await supervisor.authorize({
        sessionId,
        planDigest,
        authorizationId: "authorized-production-wsl-success",
      });

      const terminal = await supervisor.startOrAttach({ sessionId });
      expect(terminal).toMatchObject({
        kind: "completed",
        sessionId,
        launchCount: 1,
        containment: {
          processTreeTerminated: true,
          liveProcessCount: 0,
        },
      });
      expect(await supervisor.startOrAttach({ sessionId })).toEqual(terminal);
      expect(JSON.parse(fs.readFileSync(path.join(worktreePath, "linux-success.json"), "utf8"))).toMatchObject({
        processId: expect.any(Number),
      });
      await waitUntil(async () => {
        const inspection = await inspectWslSystemdUnit(systemd.unitName);
        return !inspection.active && !inspection.populated;
      }, "durable WSL unit to reach zero");
    });
  },
);
