import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { unprivilegedWslCommandArguments } from "../../scripts/ralph/worker-isolation.mjs";
import { createWindowsJobContainment } from "../../scripts/ralph/v2/windows-job-containment.mjs";
import {
  createWslSystemdChildPlan,
  inspectWslSystemdUnit,
} from "../../scripts/ralph/v2/wsl-systemd-containment.mjs";
import { windowsToWslPath } from "../../scripts/ralph/v2/wsl-worker-sandbox.mjs";

const HOSTILE_ROOT_SOURCE = fileURLToPath(
  new URL("./fixtures/wsl-systemd-hostile-root.mjs", import.meta.url),
);
const HOSTILE_DESCENDANT_SOURCE = fileURLToPath(
  new URL("./fixtures/wsl-systemd-hostile-descendant.mjs", import.meta.url),
);
const roots: string[] = [];
const containments: Array<ReturnType<typeof createWindowsJobContainment>> = [];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMilliseconds = 30_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`);
    await sleep(50);
  }
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function wslExecutablePath() {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("test cannot locate wsl.exe");
  return path.join(systemRoot, "System32", "wsl.exe");
}

function runWsl(args: string[]) {
  const result = spawnSync(wslExecutablePath(), ["--", ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `WSL test command failed: ${String(
        result.stderr || result.stdout || result.error?.message || result.status,
      ).trim()}`,
    );
  }
}

async function launchHostileSession({
  name,
  runtimeTimeoutSeconds = 120,
  ignoreSignals = false,
}: {
  name: string;
  runtimeTimeoutSeconds?: number;
  ignoreSignals?: boolean;
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-wsl-systemd-"));
  roots.push(root);
  const worktreePath = path.join(root, "worktree");
  const containmentRoot = path.join(root, "containment");
  fs.mkdirSync(worktreePath, { recursive: true });
  const hostileRootPath = path.join(worktreePath, path.basename(HOSTILE_ROOT_SOURCE));
  fs.copyFileSync(HOSTILE_ROOT_SOURCE, hostileRootPath);
  fs.copyFileSync(
    HOSTILE_DESCENDANT_SOURCE,
    path.join(worktreePath, path.basename(HOSTILE_DESCENDANT_SOURCE)),
  );
  const sessionId = `ralph-v2:wsl-systemd:${name}`;
  const containment = createWindowsJobContainment({
    containmentRoot,
    sessionId,
    pollIntervalMilliseconds: 20,
    trustedWslBridge: true,
  });
  containments.push(containment);
  const linuxLaunch = unprivilegedWslCommandArguments({
    home: "/var/lib/betterr-me-ralph/worker-home",
    command: "/usr/local/bin/node",
    args: [windowsToWslPath(hostileRootPath), windowsToWslPath(worktreePath)],
  });
  const systemd = createWslSystemdChildPlan({
    containmentRoot,
    sessionId,
    runtimeTimeoutSeconds,
    child: {
      executable: linuxLaunch[0],
      args: linuxLaunch.slice(1),
      cwd: windowsToWslPath(worktreePath),
      environment: ignoreSignals ? { RALPH_TEST_IGNORE_SIGNALS: "1" } : {},
    },
  });
  const handle = await containment.launch({
    authorization: {
      authorizationId: `authorized-wsl-systemd-${name}`,
      planDigest: systemd.planDigest,
    },
    child: systemd.windowsChild,
  });
  await waitUntil(
    () => {
      for (const factName of ["linux-failure.json", "failure.json"]) {
        const factPath = path.join(containmentRoot, factName);
        if (fs.existsSync(factPath)) {
          throw new Error(
            `${factName}: ${fs.readFileSync(factPath, "utf8").trim()}`,
          );
        }
      }
      const completedPath = path.join(containmentRoot, "completed.json");
      if (
        fs.existsSync(completedPath) &&
        !fs.existsSync(path.join(containmentRoot, "linux-ready.json"))
      ) {
        throw new Error(
          `wsl.exe exited before Linux readiness: ${fs
            .readFileSync(completedPath, "utf8")
            .trim()}`,
        );
      }
      return (
        fs.existsSync(path.join(containmentRoot, "linux-ready.json")) &&
        fs.existsSync(path.join(worktreePath, "linux-root.json")) &&
        fs.existsSync(path.join(worktreePath, "linux-descendant.json"))
      );
    },
    "Linux root and detached descendant",
  );
  expect(await inspectWslSystemdUnit(systemd.unitName)).toMatchObject({
    unitExists: true,
    active: true,
    populated: true,
  });
  return {
    root,
    worktreePath,
    containmentRoot,
    containment,
    handle,
    systemd,
    sessionId,
    windowsReady: readJson(path.join(containmentRoot, "ready.json")),
    linuxReady: readJson(path.join(containmentRoot, "linux-ready.json")),
  };
}

async function waitForSystemdZero({
  unitName,
  containmentRoot,
  description,
}: {
  unitName: string;
  containmentRoot: string;
  description: string;
}) {
  let lastInspection = null;
  try {
    await waitUntil(async () => {
      lastInspection = await inspectWslSystemdUnit(unitName);
      return !lastInspection.active && !lastInspection.populated;
    }, description, 15_000);
  } catch (error) {
    const diagnosticFacts = Object.fromEntries(
      ["linux-exit-intent.json", "linux-result.json", "linux-failure.json"].map(
        (factName) => {
          const factPath = path.join(containmentRoot, factName);
          return [
            factName,
            fs.existsSync(factPath)
              ? fs.readFileSync(factPath, "utf8").trim()
              : null,
          ];
        },
      ),
    );
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; ${JSON.stringify({
        brokerMarkerExists: fs.existsSync(path.join(containmentRoot, "broker-live")),
        lastInspection,
        diagnosticFacts,
      })}`,
    );
  }
}

afterEach(async () => {
  for (const containment of containments.splice(0)) {
    try {
      await containment.terminate({
        operationId: "dual-containment-test-cleanup",
        reason: "platform-acceptance-test",
      });
    } catch {
      // Crash paths synthesize terminal evidence after both owners prove zero.
    }
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20 });
  }
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 WSL systemd containment",
  () => {
    it("kills a detached Linux descendant when the Windows broker crashes", async () => {
      const session = await launchHostileSession({ name: "broker-crash" });
      process.kill(session.windowsReady.broker.processId, "SIGKILL");

      await waitForSystemdZero({
        unitName: session.systemd.unitName,
        containmentRoot: session.containmentRoot,
        description: "systemd cgroup to prove zero Linux workers after broker crash",
      });
      expect(fs.existsSync(path.join(session.containmentRoot, "broker-live"))).toBe(
        false,
      );
      expect(
        readJson(path.join(session.containmentRoot, "linux-exit-intent.json")),
      ).toMatchObject({ reason: "broker-liveness-lost" });
    });

    it("kills the complete Linux cgroup when its trusted session host crashes", async () => {
      const session = await launchHostileSession({ name: "linux-host-crash" });
      runWsl(["/bin/kill", "-KILL", String(session.linuxReady.hostProcessId)]);

      await waitForSystemdZero({
        unitName: session.systemd.unitName,
        containmentRoot: session.containmentRoot,
        description: "systemd cgroup to prove zero workers after host crash",
      });
      await waitUntil(
        () => fs.existsSync(path.join(session.containmentRoot, "completed.json")),
        "Windows bridge completion after Linux host crash",
      );
    });

    it("reattaches a replacement controller without launching another Linux unit", async () => {
      const session = await launchHostileSession({ name: "controller-reattach" });
      const originalRoot = readJson(
        path.join(session.worktreePath, "linux-root.json"),
      );
      const originalDescendant = readJson(
        path.join(session.worktreePath, "linux-descendant.json"),
      );
      const originalInspection = await inspectWslSystemdUnit(
        session.systemd.unitName,
      );
      const replacement = createWindowsJobContainment({
        containmentRoot: session.containmentRoot,
        sessionId: session.sessionId,
        pollIntervalMilliseconds: 20,
        trustedWslBridge: true,
      });
      const replacementHandle = await replacement.launch({
        authorization: {
          authorizationId: "authorized-wsl-systemd-controller-reattach",
          planDigest: session.systemd.planDigest,
        },
        child: session.systemd.windowsChild,
      });

      expect(replacementHandle.processId).toBe(session.handle.processId);
      expect(readJson(path.join(session.worktreePath, "linux-root.json"))).toEqual(
        originalRoot,
      );
      expect(
        readJson(path.join(session.worktreePath, "linux-descendant.json")),
      ).toEqual(originalDescendant);
      expect(await inspectWslSystemdUnit(session.systemd.unitName)).toMatchObject({
        mainProcessId: originalInspection.mainProcessId,
        active: true,
        populated: true,
      });
    });

    it("leaves both containment owners at zero after requested termination", async () => {
      const session = await launchHostileSession({ name: "requested-stop" });
      const receipt = await session.containment.terminate({
        operationId: "requested-stop-operation",
        reason: "controller-stop",
      });
      expect(receipt).toMatchObject({
        processTreeTerminated: true,
        liveProcessCount: 0,
      });

      await waitForSystemdZero({
        unitName: session.systemd.unitName,
        containmentRoot: session.containmentRoot,
        description: "systemd cgroup to prove zero workers after requested stop",
      });
      expect(
        readJson(path.join(session.containmentRoot, "linux-exit-intent.json")),
      ).toMatchObject({
        reason: "termination-requested",
        operationId: "requested-stop-operation",
      });
    });

    it("uses systemd's runtime bound to kill a non-cooperative Linux tree", async () => {
      const session = await launchHostileSession({
        name: "runtime-timeout",
        runtimeTimeoutSeconds: 2,
        ignoreSignals: true,
      });

      await waitForSystemdZero({
        unitName: session.systemd.unitName,
        containmentRoot: session.containmentRoot,
        description: "systemd runtime timeout to prove zero workers",
      });
      await waitUntil(
        () => fs.existsSync(path.join(session.containmentRoot, "completed.json")),
        "Windows bridge completion after systemd timeout",
      );
      expect(readJson(path.join(session.containmentRoot, "completed.json"))).toMatchObject({
        schemaVersion: 1,
      });
    });
  },
);
