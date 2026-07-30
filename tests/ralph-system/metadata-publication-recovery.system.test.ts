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
  new URL("./fixtures/metadata-publication-crash-host.mjs", import.meta.url),
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
    throw new AggregateError(
      failures,
      "failed to clean metadata-publication worlds",
    );
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

describe("Ralph v2 metadata publication recovery", () => {
  for (const boundary of ["controller", "effect"] as const) {
    it(`never exposes partial ${boundary} metadata after process death`, async () => {
      const world = createGitWorld();
      worlds.push(world);
      const issue = {
        number: boundary === "controller" ? 712 : 713,
        title: `Recover ${boundary} publication`,
        body: "Publish after an atomic metadata boundary crash.",
      };
      const scenario = createSystemScenario(world, {
        issues: [issue],
        workerChanges: [
          { path: "src/atomic-metadata.ts", content: `export const boundary = '${boundary}';\n` },
        ],
        expectedChanges: [
          {
            path: "src/atomic-metadata.ts",
            content: `export const boundary = '${boundary}';\n`,
            mode: "100644",
            status: "A",
          },
        ],
      });
      const configPath = path.join(world.root, "system-config.json");
      const enteredPath = path.join(
        world.runtimePath,
        `${boundary}-publication-entered.json`,
      );
      const authoritativePath = path.join(
        world.runtimePath,
        boundary === "controller" ? "controller-v2.lock" : "effect-v2.lock",
      );
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
        const marker = JSON.parse(fs.readFileSync(enteredPath, "utf8"));
        expect(fs.existsSync(authoritativePath)).toBe(false);
        expect(JSON.parse(fs.readFileSync(marker.candidatePath, "utf8"))).toMatchObject({
          processId: controller.pid,
        });

        controller.kill("SIGKILL");
        await once(controller, "close");
        expect(fs.existsSync(authoritativePath)).toBe(false);

        const recovered = scenario.run(RUN_ARGUMENTS);
        expect(recovered.exitCode, recovered.stderr.join("\n")).toBe(0);
        expect(JSON.parse(recovered.stdout.at(-1) ?? "null")).toMatchObject({
          issues: [{ number: issue.number, disposition: "published" }],
        });
        expect(scenario.inspectEffectLedger().filter(
          (effect) => effect.kind === "pull-request-request",
        )).toHaveLength(1);
      } finally {
        if (controller.exitCode === null && controller.signalCode === null) {
          controller.kill("SIGKILL");
          await once(controller, "close");
        }
      }
    });
  }
});
