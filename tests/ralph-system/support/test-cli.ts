import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSafeEnvironment } from "../fixtures/test-primitives.mjs";

type GitWorld = {
  controllerPath: string;
  remotePath: string;
  runtimePath: string;
  mainSha: string;
  eventLogPath: string;
  gitTracePath: string;
  root: string;
};

export function createSystemScenario(
  world: GitWorld,
  input: {
    issues: Array<{ number: number; title: string; body: string; blockers?: number[] }>;
    workerChanges: Array<{ path: string; content: string }>;
    expectedChanges: Array<{
      path: string;
      content: string;
      mode: string;
      status: string;
    }>;
    verification?: "pass" | "fail";
    verificationByIssue?: Record<string, "pass" | "fail">;
    workerChangesByIssue?: Record<
      string,
      Array<{ path: string; content: string }>
    >;
    expectedChangesByIssue?: Record<
      string,
      Array<{
        path: string;
        content: string;
        mode: string;
        status: string;
      }>
    >;
    crashPoint?: string;
    holdWorker?: boolean;
    implementationTimeoutMilliseconds?: number;
    raceControllers?: boolean;
    pullRequestChecks?: Array<Record<string, unknown>>;
    pullRequestCheckSequence?: Array<Array<Record<string, unknown>>>;
    pullRequestCheckSequenceByIssue?: Record<string, Array<Array<Record<string, unknown>>>>;
    pullRequestChecksByIssue?: Record<string, Array<Record<string, unknown>>>;
    mergeUpdatesMain?: boolean;
    repairWorkerChanges?: Array<{ path: string; content: string }>;
    repairWorkerChangesByIssue?: Record<string, Array<{ path: string; content: string }>>;
    repairWorkerChangesSequenceByIssue?: Record<string, Array<Array<{ path: string; content: string }>>>;
    repairExpectedChanges?: Array<{
      path: string;
      content: string;
      mode: string;
      status: string;
    }>;
    repairExpectedChangesByIssue?: Record<string, Array<{
      path: string;
      content: string;
      mode: string;
      status: string;
    }>>;
    repairExpectedChangesSequenceByIssue?: Record<string, Array<Array<{
      path: string;
      content: string;
      mode: string;
      status: string;
    }>>>;
    pullRequestReviewRequired?: boolean;
    pullRequestReviewDecision?: string;
    advanceMainAfterPullRequest?: { path: string; content: string };
    advanceMainAfterPullRequestByIssue?: Record<string, { path: string; content: string }>;
    pullRequestMergeStateStatusWhenBehind?: "CLEAN" | "DIRTY";
    pullRequestMergeStateStatusWhenBehindByIssue?: Record<string, "CLEAN" | "DIRTY">;
    workerResultByIssue?: Record<string, {
      kind: "completed" | "blocked" | "failed";
      ambiguous?: boolean;
      blockerKind?: string;
      summary?: string;
    }>;
    repairWorkerResultByIssue?: Record<string, {
      kind: "completed" | "blocked" | "failed";
      ambiguous?: boolean;
      blockerKind?: string;
      summary?: string;
    }>;
    initialPullRequests?: Array<Record<string, unknown>>;
  },
) {
  const configPath = path.join(world.root, "system-config.json");
  const externalStatePath = path.join(world.root, "external-state.json");
  const crashMarkerPath = path.join(world.root, "crash-injected.txt");
  const effectLedgerPath = path.join(world.root, "effect-ledger");
  const workerStartedPath = input.holdWorker
    ? path.join(world.root, "worker-started.txt")
    : undefined;
  const workerReleasePath = input.holdWorker
    ? path.join(world.root, "worker-release.txt")
    : undefined;
  const controllerReadyDirectory = input.raceControllers
    ? path.join(world.root, "controller-ready")
    : undefined;
  const controllerReleasePath = input.raceControllers
    ? path.join(world.root, "controller-release.txt")
    : undefined;
  fs.writeFileSync(
    externalStatePath,
    `${JSON.stringify(
      {
        activeWorkers: 0,
        maximumActiveWorkers: 0,
        sessions: [],
        claims: [],
        claimRequests: [],
        claimRefreshRequests: [],
        pullRequests: input.initialPullRequests ?? [],
        pullRequestRequests: [],
        readyPullRequestRequests: [],
        mergeRequests: [],
        retryCheckRequests: [],
        controllerRepairRequests: [],
        baseUpdateRequests: [],
        verificationRequests: [],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        repositoryPath: world.controllerPath,
        remotePath: world.remotePath,
        runtimePath: world.runtimePath,
        mainSha: world.mainSha,
        eventLogPath: world.eventLogPath,
        externalStatePath,
        crashMarkerPath,
        effectLedgerPath,
        workerStartedPath,
        workerReleasePath,
        controllerReadyDirectory,
        controllerReleasePath,
        now: "2026-07-30T12:00:00.000Z",
        verification: input.verification ?? "pass",
        ...input,
      },
      null,
      2,
    )}\n`,
  );

  const hostPath = fileURLToPath(
    new URL("../fixtures/test-host.mjs", import.meta.url),
  );

  const hostEnvironment = () =>
    createSafeEnvironment(process.env, {
      GIT_TRACE2_EVENT: world.gitTracePath,
      HOME: world.root,
      USERPROFILE: world.root,
    });

  const hostArguments = (args: string[]) => [hostPath, configPath, "--", ...args];

  const parseHostResult = (
    exitCode: number | null,
    stdout: string,
    stderr: string,
    signal: NodeJS.Signals | null = null,
  ) => ({
    exitCode,
    signal,
    stdout: stdout.trim().split(/\r?\n/).filter(Boolean),
    stderr: stderr.trim().split(/\r?\n/).filter(Boolean),
  });

  return {
    configPath,
    externalStatePath,
    run(args: string[]) {
      const result = spawnSync(
        process.execPath,
        hostArguments(args),
        {
          cwd: world.controllerPath,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          env: hostEnvironment(),
        },
      );
      if (result.error) {
        throw new Error(
          `Ralph test host did not exit normally: ${result.error.message}`,
        );
      }
      return parseHostResult(
        result.status,
        result.stdout,
        result.stderr,
        result.signal,
      );
    },
    start(args: string[]) {
      const child = spawn(process.execPath, hostArguments(args), {
        cwd: world.controllerPath,
        windowsHide: true,
        env: hostEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      });
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
      const completion = new Promise<ReturnType<typeof parseHostResult>>(
        (resolve, reject) => {
          child.once("error", reject);
          child.once("close", (exitCode, signal) => {
            resolve(parseHostResult(exitCode, stdout, stderr, signal));
          });
        },
      );
      return { child, completion };
    },
    async waitForWorkerStart(timeoutMilliseconds = 10_000) {
      if (!workerStartedPath) {
        throw new Error("scenario does not hold its worker");
      }
      const deadline = Date.now() + timeoutMilliseconds;
      while (!fs.existsSync(workerStartedPath)) {
        if (Date.now() >= deadline) {
          throw new Error("timed out waiting for the scripted worker");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    releaseWorker() {
      if (!workerReleasePath) {
        throw new Error("scenario does not hold its worker");
      }
      fs.writeFileSync(workerReleasePath, "release\n");
    },
    async waitForControllers(count: number, timeoutMilliseconds = 10_000) {
      if (!controllerReadyDirectory) {
        throw new Error("scenario does not race its controllers");
      }
      const deadline = Date.now() + timeoutMilliseconds;
      while (
        !fs.existsSync(controllerReadyDirectory) ||
        fs.readdirSync(controllerReadyDirectory).length < count
      ) {
        if (Date.now() >= deadline) {
          throw new Error("timed out waiting for scripted controllers");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    releaseControllers() {
      if (!controllerReleasePath) {
        throw new Error("scenario does not race its controllers");
      }
      fs.writeFileSync(controllerReleasePath, "release\n");
    },
    inspectExternalState() {
      return JSON.parse(fs.readFileSync(externalStatePath, "utf8"));
    },
    updateExternalState(update: (state: any) => void) {
      const state = JSON.parse(fs.readFileSync(externalStatePath, "utf8"));
      update(state);
      const temporaryPath = `${externalStatePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
      fs.renameSync(temporaryPath, externalStatePath);
    },
    inspectEffectLedger() {
      if (!fs.existsSync(effectLedgerPath)) return [];
      return fs.readdirSync(effectLedgerPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) =>
          JSON.parse(
            fs.readFileSync(path.join(effectLedgerPath, entry.name), "utf8"),
          ),
        );
    },
    inspectEvents() {
      if (!fs.existsSync(world.eventLogPath)) return [];
      return fs.readFileSync(world.eventLogPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
    inspectGitTrace() {
      if (!fs.existsSync(world.gitTracePath)) return [];
      return fs.readFileSync(world.gitTracePath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}
