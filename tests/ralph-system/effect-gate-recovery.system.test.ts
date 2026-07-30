import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSafeEnvironment } from "./fixtures/test-primitives.mjs";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const RUN_ARGUMENTS = [
  "run",
  "--mode",
  "PrOnly",
  "--max-issues",
  "1",
  "--json",
];
const HOST_PATH = fileURLToPath(
  new URL("./fixtures/effect-gate-crash-host.mjs", import.meta.url),
);
const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  const failures: unknown[] = [];
  for (const world of worlds.splice(0)) {
    try {
      world.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "failed to clean effect-gate worlds");
  }
});

async function waitForPath(filePath: string, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${path.basename(filePath)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("Ralph v2 effect-gate crash recovery", () => {
  for (const boundary of ["before", "after"] as const) {
    it(`recovers when the controller dies ${boundary} an admitted external effect`, async () => {
      const world = createGitWorld();
      worlds.push(world);
      const issue = {
        number: boundary === "before" ? 710 : 711,
        title: `Recover ${boundary} claim`,
        body: "Deliver exactly once after controller death.",
      };
      const scenario = createSystemScenario(world, {
        issues: [issue],
        workerChanges: [
          { path: "src/effect-gate.ts", content: `export const boundary = '${boundary}';\n` },
        ],
        expectedChanges: [
          {
            path: "src/effect-gate.ts",
            content: `export const boundary = '${boundary}';\n`,
            mode: "100644",
            status: "A",
          },
        ],
      });
      const configPath = path.join(world.root, "system-config.json");
      const enteredPath = path.join(
        world.runtimePath,
        `effect-gate-${boundary}-entered.json`,
      );
      const effectGatePath = path.join(world.runtimePath, "effect-v2.lock");
      const controller = spawn(
        process.execPath,
        [HOST_PATH, configPath, boundary, "--", ...RUN_ARGUMENTS],
        {
          cwd: world.controllerPath,
          windowsHide: true,
          env: createSafeEnvironment(process.env, {
            GIT_TRACE2_EVENT: world.gitTracePath,
            HOME: world.root,
            USERPROFILE: world.root,
          }),
          stdio: "ignore",
        },
      );

      try {
        await waitForPath(enteredPath);
        expect(JSON.parse(fs.readFileSync(effectGatePath, "utf8"))).toMatchObject({
          processId: controller.pid,
          effect: "claim-issue",
        });
        controller.kill("SIGKILL");
        await once(controller, "close");

        const recovered = scenario.run(RUN_ARGUMENTS);
        expect(recovered.exitCode, recovered.stderr.join("\n")).toBe(0);
        expect(recovered.stderr).toEqual([]);
        expect(JSON.parse(recovered.stdout.at(-1) ?? "null")).toMatchObject({
          workerLease: null,
          issues: [
            {
              number: issue.number,
              disposition: "published",
              pullRequestNumber: 1,
            },
          ],
        });
        expect(fs.existsSync(effectGatePath)).toBe(false);

        const effects = scenario.inspectEffectLedger();
        expect(effects.filter((effect) => effect.kind === "claim-request")).toHaveLength(1);
        expect(effects.filter((effect) => effect.kind === "worker-request")).toHaveLength(1);
        expect(effects.filter((effect) => effect.kind === "pull-request-request")).toHaveLength(1);
        expect(scenario.inspectExternalState()).toMatchObject({
          maximumActiveWorkers: 1,
          pullRequestRequests: [{ issueNumber: issue.number }],
        });
      } finally {
        if (controller.exitCode === null && controller.signalCode === null) {
          controller.kill("SIGKILL");
          await once(controller, "close");
        }
      }
    });
  }
});
