import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readProcessIdentity } from "../../scripts/ralph/v2/state-store.mjs";
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
  new URL("./fixtures/controller-lock-race-host.mjs", import.meta.url),
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
      "failed to clean controller-lock race worlds",
    );
  }
});

type HostResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string[];
  stderr: string[];
};

function startController(
  world: ReturnType<typeof createGitWorld>,
  role: "reclaimer" | "owner",
) {
  const configPath = path.join(world.root, "system-config.json");
  const child = spawn(
    process.execPath,
    [HOST_PATH, configPath, role, "--", ...RUN_ARGUMENTS],
    {
      cwd: world.controllerPath,
      windowsHide: true,
      env: createSafeEnvironment(process.env, {
        GIT_TRACE2_EVENT: world.gitTracePath,
        HOME: world.root,
        USERPROFILE: world.root,
      }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise<HostResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: stdout.trim().split(/\r?\n/).filter(Boolean),
        stderr: stderr.trim().split(/\r?\n/).filter(Boolean),
      });
    });
  });
  return { child, completion };
}

function waitForMarker(filePath: string, timeoutMilliseconds = 10_000) {
  if (fs.existsSync(filePath)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (fs.existsSync(filePath)) finish();
    };
    const timeout = setTimeout(
      () => finish(new Error(`timed out waiting for ${path.basename(filePath)}`)),
      timeoutMilliseconds,
    );
    const watcher = fs.watch(path.dirname(filePath), (eventType, filename) => {
      if (filename === null || filename.toString() === path.basename(filePath)) {
        inspect();
      }
    });
    watcher.once("error", (error) => finish(error));
    inspect();
  });
}

function completeWithin(
  completion: Promise<HostResult>,
  description: string,
  timeoutMilliseconds = 10_000,
) {
  return new Promise<HostResult>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for ${description}`)),
      timeoutMilliseconds,
    );
    completion.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function writeMarker(filePath: string) {
  try {
    fs.writeFileSync(filePath, "release\n", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

function differentValidIdentity(identity: string) {
  if (identity.startsWith("windows-start-ticks:")) {
    const ticks = BigInt(identity.slice("windows-start-ticks:".length));
    return `windows-start-ticks:${ticks + 1n}`;
  }
  if (identity.startsWith("linux-boot-start:")) {
    const separator = identity.lastIndexOf(":");
    return `${identity.slice(0, separator + 1)}${
      BigInt(identity.slice(separator + 1)) + 1n
    }`;
  }
  return `${identity} different`;
}

describe("Ralph v2 controller-lock stale reclamation race", () => {
  it("does not admit a new controller during stale metadata reclamation", async () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [],
      workerChanges: [],
      expectedChanges: [],
    });
    const lockPath = path.join(world.runtimePath, "controller-v2.lock");
    const barrierDirectory = path.join(
      world.runtimePath,
      "controller-lock-race-barriers",
    );
    const barriers = {
      reclaimerReady: path.join(barrierDirectory, "reclaimer-ready"),
      reclaimerRelease: path.join(barrierDirectory, "reclaimer-release"),
      ownerReady: path.join(barrierDirectory, "owner-ready"),
      ownerRelease: path.join(barrierDirectory, "owner-release"),
    };
    fs.mkdirSync(barrierDirectory, { recursive: true });

    const currentIdentity = readProcessIdentity(process.pid);
    if (!currentIdentity) throw new Error("test process identity is unavailable");
    const staleOwner = {
      token: "44444444-4444-4444-8444-444444444444",
      processId: process.pid,
      processIdentity: differentValidIdentity(currentIdentity),
      createdAt: "2000-01-01T00:00:00.000Z",
    };
    fs.writeFileSync(lockPath, `${JSON.stringify(staleOwner)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    const reclaimer = startController(world, "reclaimer");
    let owner: ReturnType<typeof startController> | undefined;
    let reclaimerResult: HostResult | undefined;
    let ownerResult: HostResult | undefined;

    try {
      await waitForMarker(barriers.reclaimerReady);
      fs.rmSync(lockPath);
      owner = startController(world, "owner");
      ownerResult = await completeWithin(
        owner.completion,
        "contending controller",
      );
      expect(ownerResult.exitCode).toBe(1);
      expect(ownerResult.stderr.join("\n")).toMatch(/OS mutex is active/i);
      expect(fs.existsSync(barriers.ownerReady)).toBe(false);

      writeMarker(barriers.reclaimerRelease);
      reclaimerResult = await completeWithin(
        reclaimer.completion,
        "stale reclaimer",
      );
    } finally {
      writeMarker(barriers.reclaimerRelease);
      writeMarker(barriers.ownerRelease);
      for (const host of [reclaimer, owner]) {
        if (host && host.child.exitCode === null && host.child.signalCode === null) {
          host.child.kill("SIGKILL");
        }
      }
      await Promise.allSettled(
        [reclaimer, owner].filter(Boolean).map((host) => host!.completion),
      );
    }

    expect(reclaimerResult?.exitCode).toBe(0);
    expect(reclaimerResult?.stderr).toEqual([]);
    expect(ownerResult?.exitCode).toBe(1);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(scenario.inspectEffectLedger()).toEqual([]);
  });
});
