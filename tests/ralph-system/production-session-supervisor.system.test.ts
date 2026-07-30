import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionSessionSupervisor } from "../../scripts/ralph/v2/production-session-supervisor.mjs";
import { computeSessionPlanDigest } from "../../scripts/ralph/v2/session-supervisor.mjs";

const HOSTILE_ROOT_PATH = fileURLToPath(
  new URL("./fixtures/windows-job-hostile-root.mjs", import.meta.url),
);
const HOSTILE_DESCENDANT_PATH = fileURLToPath(
  new URL("./fixtures/windows-job-hostile-descendant.mjs", import.meta.url),
);
const roots: string[] = [];

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

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMilliseconds = 20_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${description}`);
    }
    await sleep(20);
  }
}

afterEach(() => {
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
  "Ralph v2 production session supervisor",
  () => {
    it("runs the durable protocol over a real Job Object and proves zero descendants", async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-production-session-"));
      roots.push(root);
      const fixtureRoot = path.join(root, "fixture");
      const sessionRoot = path.join(root, "sessions");
      const sessionId = "ralph-v2:production-session:job-object";
      const hostileRootPath = prepareHostileFixture(fixtureRoot);
      const supervisor = createProductionSessionSupervisor({
        sessionRoot,
        containmentRoot: path.join(root, "containment"),
        pollIntervalMilliseconds: 20,
        waitTimeoutMilliseconds: 30_000,
      });
      const child = {
        executable: process.execPath,
        args: [hostileRootPath, fixtureRoot],
        cwd: fixtureRoot,
        environment: {},
        holdBeforeSpawn: false,
      };
      const planDigest = computeSessionPlanDigest({ sessionId, child });
      await supervisor.plan({ sessionId, planDigest, child });
      await supervisor.authorize({
        sessionId,
        authorizationId: "production-session-authorization",
        planDigest,
      });
      const terminalPromise = supervisor.startOrAttach({ sessionId });
      await waitUntil(
        () =>
          fs.existsSync(path.join(fixtureRoot, "root.json")) &&
          fs.existsSync(path.join(fixtureRoot, "descendant.json")),
        "production-supervised root and descendant",
      );
      const running = await supervisor.inspect(sessionId);
      expect(running).toMatchObject({
        status: "running",
        launchCount: 1,
        relaunchAllowed: false,
        owner: { role: "trusted-supervisor" },
      });

      const stopped = await supervisor.terminate({
        sessionId,
        operationId: "production-session-stop",
        reason: "platform-acceptance-test",
      });
      expect(stopped).toMatchObject({
        kind: "terminated",
        launchCount: 1,
        processTreeTerminated: true,
        containment: {
          guarantee: "windows-job-object-kill-on-close-no-breakaway",
          liveProcessCount: 0,
          processTreeTerminated: true,
        },
      });
      await expect(terminalPromise).resolves.toEqual(stopped);
      await waitUntil(
        async () => (await supervisor.inspect(sessionId)).owner === null,
        "trusted supervisor host exit",
      );
    });
  },
);
