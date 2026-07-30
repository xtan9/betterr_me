import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";
import { createWindowsJobContainment } from "../../scripts/ralph/v2/windows-job-containment.mjs";

const HOSTILE_ROOT_PATH = fileURLToPath(
  new URL("./fixtures/windows-job-hostile-root.mjs", import.meta.url),
);
const HOSTILE_DESCENDANT_PATH = fileURLToPath(
  new URL("./fixtures/windows-job-hostile-descendant.mjs", import.meta.url),
);
const CONTROLLER_HOST_PATH = fileURLToPath(
  new URL("./fixtures/windows-job-controller-host.mjs", import.meta.url),
);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HOST_SOURCE_PATH = fileURLToPath(
  new URL("../../scripts/ralph/v2/windows-job-host.cs", import.meta.url),
);
const roots: string[] = [];
const containments: Array<ReturnType<typeof createWindowsJobContainment>> = [];
const hosts: ChildProcess[] = [];
const originalControllerSecret = process.env.RALPH_TEST_CONTROLLER_SECRET;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMilliseconds = 15_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await sleep(20);
  }
}

function recordAt(root: string, name: string) {
  return JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}

function sameProcessIsAlive(record: {
  processId: number;
  processIdentity: string;
}) {
  return readProcessIdentity(record.processId) === record.processIdentity;
}

function prepareHostileFixture(fixtureRoot: string) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const rootPath = path.join(fixtureRoot, path.basename(HOSTILE_ROOT_PATH));
  fs.copyFileSync(HOSTILE_ROOT_PATH, rootPath);
  fs.copyFileSync(
    HOSTILE_DESCENDANT_PATH,
    path.join(fixtureRoot, path.basename(HOSTILE_DESCENDANT_PATH)),
  );
  return rootPath;
}

afterEach(async () => {
  if (originalControllerSecret === undefined) {
    delete process.env.RALPH_TEST_CONTROLLER_SECRET;
  } else {
    process.env.RALPH_TEST_CONTROLLER_SECRET = originalControllerSecret;
  }
  for (const containment of containments.splice(0)) {
    try {
      await containment.terminate({
        operationId: "platform-test-cleanup",
        reason: "platform-acceptance-test",
      });
    } catch {
      // Preserve the primary assertion; the PID identity checks still guard cleanup.
    }
  }
  for (const host of hosts.splice(0)) {
    if (host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  }
});

describe.runIf(process.platform === "win32")(
  "Ralph v2 Windows Job Object containment",
  () => {
    it("rejects a pre-seeded broker executable before it can run", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const containmentRoot = path.join(root, "containment");
      const sourceDigest = createHash("sha256")
        .update(fs.readFileSync(HOST_SOURCE_PATH))
        .digest("hex");
      const hostRoot = path.join(
        containmentRoot,
        "host",
        sourceDigest.slice(0, 16),
      );
      fs.mkdirSync(hostRoot, { recursive: true });
      fs.writeFileSync(path.join(hostRoot, "job-host.exe"), "not trusted\n");

      expect(() =>
        createWindowsJobContainment({
          containmentRoot,
          sessionId: "ralph-v2:windows-job:preseeded-host",
        }),
      ).toThrow(/pre-seeded.*trusted receipt/i);
    });

    it("rejects case-insensitive reserved and duplicate environment names", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const containment = createWindowsJobContainment({
        containmentRoot: path.join(root, "containment"),
        sessionId: "ralph-v2:windows-job:environment-integrity",
      });
      const baseLaunch = {
        authorization: {
          authorizationId: "authorized-environment-integrity",
          planDigest: "e".repeat(64),
        },
        child: {
          executable: process.execPath,
          args: [hostileRootPath, fixtureRoot],
          cwd: fixtureRoot,
          holdBeforeSpawn: false,
        },
      };
      await expect(
        containment.launch({
          ...baseLaunch,
          child: {
            ...baseLaunch.child,
            environment: { ralph_v2_plan_digest: "issue-controlled" },
          },
        }),
      ).rejects.toThrow(/child plan.*integrity/i);
      await expect(
        containment.launch({
          ...baseLaunch,
          child: {
            ...baseLaunch.child,
            environment: { Path: "one", PATH: "two" },
          },
        }),
      ).rejects.toThrow(/child plan.*integrity/i);
    });

    it("keeps the controller token exception limited to the exact trusted WSL bridge", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      fs.mkdirSync(fixtureRoot, { recursive: true });
      const containmentRoot = path.join(root, "containment");
      const sessionId = "ralph-v2:windows-job:trusted-wsl-policy";
      const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
      if (!systemRoot) throw new Error("test cannot locate wsl.exe");
      const wslPath = path.join(systemRoot, "System32", "wsl.exe");
      const launch = {
        authorization: {
          authorizationId: "authorized-trusted-wsl-policy",
          planDigest: "d".repeat(64),
        },
        child: {
          executable: wslPath,
          args: ["--", "/bin/true"],
          cwd: fixtureRoot,
          environment: {},
          holdBeforeSpawn: false,
          tokenMode: "trusted-wsl-bridge",
        },
      };
      const defaultPolicy = createWindowsJobContainment({
        containmentRoot,
        sessionId,
      });
      await expect(defaultPolicy.launch(launch)).rejects.toThrow(
        /trusted WSL bridge authorization/i,
      );

      const enabledPolicy = createWindowsJobContainment({
        containmentRoot,
        sessionId,
        trustedWslBridge: true,
      });
      await expect(
        enabledPolicy.launch({
          ...launch,
          child: { ...launch.child, executable: process.execPath },
        }),
      ).rejects.toThrow(/trusted WSL bridge authorization/i);
    });

    it.each([
      "windows-job-config-published",
      "windows-job-broker-spawned",
    ])("recovers once after a controller crash at %s", async (checkpointPoint) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const containmentRoot = path.join(root, "containment");
      const sessionId = `ralph-v2:windows-job:recovery:${checkpointPoint}`;
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const launch = {
        authorization: {
          authorizationId: `authorized-${checkpointPoint}`,
          planDigest: "f".repeat(64),
        },
        child: {
          executable: process.execPath,
          args: [hostileRootPath, fixtureRoot],
          cwd: fixtureRoot,
          environment: {},
          holdBeforeSpawn: false,
        },
      };
      let crashed = false;
      const interrupted = createWindowsJobContainment({
        containmentRoot,
        sessionId,
        pollIntervalMilliseconds: 20,
        lifecycle: {
          async checkpoint({ point }: { point: string }) {
            if (!crashed && point === checkpointPoint) {
              crashed = true;
              throw new Error(`injected controller crash at ${point}`);
            }
          },
        },
      });
      await expect(interrupted.launch(launch)).rejects.toThrow(
        new RegExp(`injected controller crash at ${checkpointPoint}`),
      );

      const replacement = createWindowsJobContainment({
        containmentRoot,
        sessionId,
        pollIntervalMilliseconds: 20,
      });
      containments.push(replacement);
      const child = await replacement.launch(launch);
      await waitUntil(
        () =>
          fs.existsSync(path.join(fixtureRoot, "root.json")) &&
          fs.existsSync(path.join(fixtureRoot, "descendant.json")),
        "single recovered contained tree",
      );
      expect(recordAt(fixtureRoot, "root.json").processId).toBe(child.processId);
      await replacement.terminate({
        operationId: "platform-test-cleanup",
        reason: "platform-acceptance-test",
      });
      await expect(child.completion).resolves.toMatchObject({ signal: null });
    });

    it("assigns before first mutation and kills a hostile detached descendant", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      process.env.RALPH_TEST_CONTROLLER_SECRET = "must-not-reach-the-worker";
      const containment = createWindowsJobContainment({
        containmentRoot: path.join(root, "containment"),
        sessionId: "ralph-v2:windows-job:assignment-race",
        pollIntervalMilliseconds: 20,
      });
      containments.push(containment);
      const child = await containment.launch({
        authorization: {
          authorizationId: "authorized-assignment-race",
          planDigest: "a".repeat(64),
        },
        child: {
          executable: process.execPath,
          args: [hostileRootPath, fixtureRoot],
          cwd: fixtureRoot,
          environment: {
            RALPH_TEST_OBSERVATION_PATH: path.join(
              root,
              "containment",
              "observation.json",
            ),
            RALPH_TEST_TERMINATION_PATH: path.join(
              root,
              "containment",
              "termination-request.json",
            ),
          },
          holdBeforeSpawn: true,
        },
      });

      expect(fs.existsSync(path.join(fixtureRoot, "root.json"))).toBe(false);
      expect(fs.existsSync(path.join(fixtureRoot, "descendant.json"))).toBe(
        false,
      );
      const suspended = await containment.inspect();
      expect(suspended.liveProcesses).toEqual([
        expect.objectContaining({
          processId: child.processId,
          processIdentity: child.processIdentity,
        }),
      ]);
      fs.writeFileSync(
        path.join(root, "containment", "launch-release"),
        "go\n",
        { flag: "wx" },
      );

      await waitUntil(
        () =>
          (fs.existsSync(path.join(fixtureRoot, "root.json")) &&
            fs.existsSync(path.join(fixtureRoot, "descendant.json"))) ||
          fs.existsSync(path.join(root, "containment", "completed.json")),
        "contained root and descendant records",
      );
      if (fs.existsSync(path.join(root, "containment", "completed.json"))) {
        throw new Error(
          `contained root exited before publishing records: ${JSON.stringify(
            recordAt(path.join(root, "containment"), "completed.json"),
          )}`,
        );
      }
      const rootRecord = recordAt(fixtureRoot, "root.json");
      const descendantRecord = recordAt(fixtureRoot, "descendant.json");
      expect(rootRecord.controllerSecret).toBeNull();
      expect(rootRecord.lowIntegrity).toBe(true);
      expect(rootRecord.proofWriteErrors).toEqual({
        observation: expect.stringMatching(/^(?:EACCES|EPERM)$/),
        termination: expect.stringMatching(/^(?:EACCES|EPERM)$/),
      });
      expect(child).toMatchObject({
        processId: rootRecord.processId,
        processIdentity: rootRecord.processIdentity,
      });

      const running = await containment.inspect();
      expect(running.guarantee).toBe(
        "windows-job-object-kill-on-close-no-breakaway",
      );
      expect(running.liveProcesses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            processId: rootRecord.processId,
            processIdentity: rootRecord.processIdentity,
          }),
          expect.objectContaining({
            processId: descendantRecord.processId,
            processIdentity: descendantRecord.processIdentity,
          }),
        ]),
      );

      const terminated = await containment.terminate({
        operationId: "platform-test-cleanup",
        reason: "platform-acceptance-test",
      });
      expect(terminated).toMatchObject({
        kind: "contained-processes-terminated",
        processTreeTerminated: true,
        liveProcessCount: 0,
      });
      await waitUntil(
        () =>
          !sameProcessIsAlive(rootRecord) &&
          !sameProcessIsAlive(descendantRecord),
        "all Job Object members to exit",
      );
      await expect(child.completion).resolves.toMatchObject({
        signal: null,
      });
      await expect(
        containment.terminate({
          operationId: "platform-test-cleanup",
          reason: "platform-acceptance-test",
        }),
      ).resolves.toEqual(terminated);
      await expect(
        containment.terminate({
          operationId: "conflicting-stop",
          reason: "platform-acceptance-test",
        }),
      ).rejects.toThrow(/operation conflicts/i);
    });

    it("reattaches after a controller crash without launching a duplicate", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const containmentRoot = path.join(root, "containment");
      const sessionId = "ralph-v2:windows-job:controller-recovery";
      const controllerReadyPath = path.join(root, "controller-ready.json");
      const configPath = path.join(root, "controller-config.json");
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const launch = {
        authorization: {
          authorizationId: "authorized-controller-recovery",
          planDigest: "b".repeat(64),
        },
        child: {
          executable: process.execPath,
          args: [hostileRootPath, fixtureRoot],
          cwd: fixtureRoot,
          environment: {},
          holdBeforeSpawn: false,
        },
      };
      fs.writeFileSync(
        configPath,
        `${JSON.stringify(
          {
            repositoryRoot: REPOSITORY_ROOT,
            containmentRoot,
            sessionId,
            controllerReadyPath,
            launch,
          },
          null,
          2,
        )}\n`,
      );
      const controller = spawn(process.execPath, [CONTROLLER_HOST_PATH, configPath], {
        cwd: fixtureRoot,
        stdio: "ignore",
        windowsHide: true,
      });
      hosts.push(controller);
      await waitUntil(
        () =>
          fs.existsSync(controllerReadyPath) &&
          fs.existsSync(path.join(fixtureRoot, "root.json")) &&
          fs.existsSync(path.join(fixtureRoot, "descendant.json")),
        "controller and contained process records",
      );
      const controllerReceipt = recordAt(root, "controller-ready.json");
      const controllerCompletion = new Promise<void>((resolve) =>
        controller.once("close", () => resolve()),
      );
      controller.kill("SIGKILL");
      await controllerCompletion;

      const replacement = createWindowsJobContainment({
        containmentRoot,
        sessionId,
        pollIntervalMilliseconds: 20,
      });
      containments.push(replacement);
      const observed = await replacement.inspect();
      expect(observed.liveProcessCount).toBeGreaterThanOrEqual(2);
      expect(
        observed.liveProcesses.some(
          (record) => record.processId === controllerReceipt.childProcessId,
        ),
      ).toBe(true);

      const attached = await replacement.launch(launch);
      expect(attached.processId).toBe(controllerReceipt.childProcessId);
      expect(fs.readdirSync(fixtureRoot).filter((name) => name === "root.json")).toHaveLength(
        1,
      );
      await replacement.terminate({
        operationId: "platform-test-cleanup",
        reason: "platform-acceptance-test",
      });
      await expect(attached.completion).resolves.toMatchObject({ signal: null });
    });

    it("kills the complete tree if its trusted broker crashes", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const containmentRoot = path.join(root, "containment");
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const containment = createWindowsJobContainment({
        containmentRoot,
        sessionId: "ralph-v2:windows-job:broker-crash",
        pollIntervalMilliseconds: 20,
        operationTimeoutMilliseconds: 5_000,
      });
      containments.push(containment);
      const child = await containment.launch({
        authorization: {
          authorizationId: "authorized-broker-crash",
          planDigest: "c".repeat(64),
        },
        child: {
          executable: process.execPath,
          args: [hostileRootPath, fixtureRoot],
          cwd: fixtureRoot,
          environment: {},
          holdBeforeSpawn: false,
        },
      });
      await waitUntil(
        () =>
          fs.existsSync(path.join(fixtureRoot, "root.json")) &&
          fs.existsSync(path.join(fixtureRoot, "descendant.json")),
        "contained processes before broker crash",
      );
      expect(fs.existsSync(path.join(containmentRoot, "broker-live"))).toBe(true);
      const rootRecord = recordAt(fixtureRoot, "root.json");
      const descendantRecord = recordAt(fixtureRoot, "descendant.json");
      const brokerRecord = recordAt(containmentRoot, "ready.json").broker;
      process.kill(brokerRecord.processId, "SIGKILL");
      await waitUntil(
        () =>
          !sameProcessIsAlive(brokerRecord) &&
          !sameProcessIsAlive(rootRecord) &&
          !sameProcessIsAlive(descendantRecord) &&
          !fs.existsSync(path.join(containmentRoot, "broker-live")),
        "kill-on-close after broker crash",
      );

      await expect(child.completion).resolves.toEqual({
        exitCode: 137,
        signal: null,
      });
      await expect(
        containment.terminate({
          operationId: "platform-test-cleanup",
          reason: "platform-acceptance-test",
        }),
      ).resolves.toMatchObject({
        processTreeTerminated: true,
        liveProcessCount: 0,
      });
    });

    it("cannot leak the suspended root when the broker crashes after native creation", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-job-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const containmentRoot = path.join(root, "containment");
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const containment = createWindowsJobContainment({
        containmentRoot,
        sessionId: "ralph-v2:windows-job:atomic-create-crash",
        pollIntervalMilliseconds: 20,
        operationTimeoutMilliseconds: 3_000,
        nativeFaultPoint: "after-atomic-create-before-ready",
      });
      containments.push(containment);

      await expect(
        containment.launch({
          authorization: {
            authorizationId: "authorized-atomic-create-crash",
            planDigest: "d".repeat(64),
          },
          child: {
            executable: process.execPath,
            args: [hostileRootPath, fixtureRoot],
            cwd: fixtureRoot,
            environment: {},
            holdBeforeSpawn: false,
          },
        }),
      ).rejects.toThrow(/timed out waiting for Job Object assignment receipt/i);
      const fault = recordAt(containmentRoot, "fault-child.json");
      expect(fault.faultPoint).toBe("after-atomic-create-before-ready");
      await waitUntil(
        () => !sameProcessIsAlive(fault.root),
        "atomically assigned suspended root to die with its broker",
      );
      expect(fs.existsSync(path.join(fixtureRoot, "root.json"))).toBe(false);
      await expect(containment.inspect()).rejects.toThrow(
        /no authoritative process observation/i,
      );
      await expect(
        containment.terminate({
          operationId: "platform-test-cleanup",
          reason: "platform-acceptance-test",
        }),
      ).resolves.toMatchObject({
        knownProcesses: [
          {
            processId: fault.root.processId,
            processIdentity: fault.root.processIdentity,
          },
        ],
        liveProcessCount: 0,
        processTreeTerminated: true,
      });
      expect((await containment.inspect()).liveProcessCount).toBe(0);
    });
  },
);
