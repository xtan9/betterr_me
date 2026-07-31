import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  codexStartupEventsReady,
  codexSessionStarted,
  ensureSanitizedWorkerGitView,
  immutableDependencyExecutableDiscoveryArguments,
  immutableDependencyExecutablePaths,
  immutableDependencyExecutableRepairArguments,
  immutableDependencyExecutableStatArguments,
  immutableDependencyExecutableStatsAreSafe,
  isolatedCodexAuthInstallRequired,
  isolatedCodexReadablePaths,
  isolatedCodexRuntimeConfiguration,
  processExitCode,
  removeSanitizedWorkerGitView,
  sanitizedWorkerGitViewRecoveryAction,
  unprivilegedWslCommandArguments,
  unprivilegedWslIdentityIsSafe,
  unprivilegedWslIdentityProbeArguments,
  workerCodexModelArguments,
  workerGitSmokeCommand,
} from "../../scripts/ralph/worker-isolation.mjs";
import {
  WORKER_PROTECTED_PATHS,
  issueAllowsNewSupabaseMigration,
  isSupabaseMigrationPath,
  isTopLevelSupabaseSqlFixturePath,
  workerChangePolicyViolation,
  workerProtectedPath,
  workerProtectedPathsForIssue,
} from "../../scripts/ralph/worker-path-policy.mjs";

const gitCommand = process.platform === "win32" ? "git.exe" : "git";

function git(args: string[], options: { input?: string } = {}) {
  const result = spawnSync(gitCommand, args, {
    encoding: "utf8",
    input: options.input,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git failed with ${result.status}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function gitWithoutStdin(args: string[], options: { input?: string } = {}) {
  if (options.input !== undefined) {
    throw new Error("git stdin transport is unavailable");
  }
  return git(args, options);
}

describe("Ralph sanitized worker Git view", () => {
  it("repairs only immutable Linux esbuild binaries without making them writable", () => {
    const root = "/var/lib/betterr-me-ralph/deps-source/node_modules";
    const selector = "*/node_modules/@esbuild/linux-x64/bin/esbuild";
    const binaries = [
      `${root}/.pnpm/@esbuild+linux-x64@0.27.2/node_modules/@esbuild/linux-x64/bin/esbuild`,
      `${root}/.pnpm/@esbuild+linux-x64@0.27.3/node_modules/@esbuild/linux-x64/bin/esbuild`,
    ];
    expect(immutableDependencyExecutableDiscoveryArguments(root)).toEqual([
      "find",
      root,
      "-path",
      selector,
      "-type",
      "f",
      "-print",
    ]);
    expect(
      immutableDependencyExecutablePaths(`${binaries.join("\n")}\n`, root),
    ).toEqual(binaries);
    expect(immutableDependencyExecutableStatArguments(binaries)).toEqual([
      "stat",
      "-c",
      "%U:%G:%a",
      ...binaries,
    ]);
    expect(immutableDependencyExecutableRepairArguments(binaries)).toEqual([
      "chmod",
      "0555",
      ...binaries,
    ]);
    expect(
      immutableDependencyExecutableStatsAreSafe(
        "root:root:444\nroot:root:555\n",
        binaries.length,
      ),
    ).toBe(true);
    expect(
      immutableDependencyExecutableStatsAreSafe(
        "root:root:555\nroot:root:555\n",
        binaries.length,
        "555",
      ),
    ).toBe(true);
    expect(
      immutableDependencyExecutableStatsAreSafe(
        "nobody:root:444\nroot:root:555\n",
        binaries.length,
      ),
    ).toBe(false);
    expect(
      immutableDependencyExecutableStatsAreSafe(
        "root:root:555\nroot:root:755\n",
        binaries.length,
        "555",
      ),
    ).toBe(false);
    expect(() =>
      immutableDependencyExecutablePaths("/tmp/esbuild\n", root),
    ).toThrow("unexpected immutable esbuild path");
  });

  it("rebuilds stale metadata only before the durable merge begins", () => {
    expect(
      sanitizedWorkerGitViewRecoveryAction({
        mergeActive: false,
        recordedBaseSha: "old-head",
        expectedBaseSha: "pr-head",
      }),
    ).toBe("rebuild");
    expect(
      sanitizedWorkerGitViewRecoveryAction({
        mergeActive: true,
        recordedBaseSha: "pr-head",
        expectedBaseSha: "pr-head",
      }),
    ).toBe("adopt");
    expect(
      sanitizedWorkerGitViewRecoveryAction({
        mergeActive: true,
        recordedBaseSha: "old-head",
        expectedBaseSha: "pr-head",
      }),
    ).toBe("unsafe");
  });

  it.each([
    ".github/workflows/e2e.yml",
    ".gitattributes",
    "scripts/ralph/controller.mjs",
    "scripts/ci/ralph-sql-policy.mjs",
    "scripts/ci/run-ralph-sql-tests.sh",
    "scripts/ci/run-sql-fixtures.sh",
    "scripts/ci/sql-fixture-registry.mjs",
    "scripts/ci/verify-sql-fixture-runner.sh",
    "supabase/migrations/20260729000001_ticket.sql",
    "supabase/config.toml",
    "supabase/seed.sql",
    "supabase/tests/e2e_local_authenticated_grants.sql",
    "supabase/tests/calendar_event_reminder_lifecycle.sql",
    "supabase/tests/control_plane_authorization.sql",
    "supabase/tests/finance_cushion_rls.sql",
    "supabase/tests/oauth_refresh_token_lifecycle.sql",
    "supabase/tests/oauth_refresh_token_upgrade.sql",
    "supabase/tests/ralph_ci_runner_security.sql",
    "AGENTS.md",
    "pnpm-workspace.yaml",
    ".env.local",
    "nested/private.pem",
  ])("protects controller-trusted worker path %s", (filePath) => {
    expect(workerProtectedPath(filePath)).toBe(true);
  });

  it.each([
    "app/api/tasks/route.ts",
    "supabase/tests/ticket_fixture.sql",
    "tests/ticket.test.ts",
  ])("allows ordinary ticket path %s", (filePath) => {
    expect(workerProtectedPath(filePath)).toBe(false);
  });

  it("allows one new migration only for an explicitly trusted queue entry", () => {
    const issue = { trustedWorkerPolicy: { newSupabaseMigrations: 1 } };
    expect(issueAllowsNewSupabaseMigration(issue)).toBe(true);
    expect(workerProtectedPathsForIssue(issue)).not.toContain("supabase/migrations");
    expect(
      workerChangePolicyViolation(
        [
          {
            status: "A",
            path: "supabase/migrations/20260730050000_delete_event_atomically.sql",
          },
        ],
        issue,
      ),
    ).toBeNull();
    expect(
      workerChangePolicyViolation(
        [
          {
            status: "A",
            path: "supabase/migrations/20260730050000_delete_event_atomically.sql",
          },
        ],
        {},
      ),
    ).toContain("controller-protected");
  });

  it.each([
    [[{ status: "M", path: "supabase/migrations/20260701000000_old.sql" }]],
    [[{ status: "A", path: "supabase/migrations/not_timestamped.sql" }]],
    [[{ status: "A", path: "supabase/migrations/20260730050000_DROP_TABLE.SQL" }]],
    [[
      { status: "A", path: "supabase/migrations/20260730050000_first.sql" },
      { status: "A", path: "supabase/migrations/20260730050001_second.sql" },
    ]],
    [[{ status: "M", path: ".github/workflows/ci.yml" }]],
  ])("rejects unsafe trusted migration scope %#", (changes) => {
    expect(
      workerChangePolicyViolation(changes, {
        trustedWorkerPolicy: { newSupabaseMigrations: 1 },
      }),
    ).not.toBeNull();
  });

  it("matches the migration scope consistently without weakening filename case", () => {
    expect(isSupabaseMigrationPath("SUPABASE\\MIGRATIONS\\FILE.SQL")).toBe(true);
    expect(isSupabaseMigrationPath("supabase/tests/file.sql")).toBe(false);
    expect(isTopLevelSupabaseSqlFixturePath("supabase/tests/file.sql")).toBe(true);
    expect(isTopLevelSupabaseSqlFixturePath("supabase/tests/file.SQL")).toBe(false);
    expect(isTopLevelSupabaseSqlFixturePath("SUPABASE/tests/file.sql")).toBe(false);
  });

  it("keeps every protected source path in the worker read-only overlay", () => {
    const protectedPaths = WORKER_PROTECTED_PATHS.map(
      (relativePath) => `/worktree/${relativePath}`,
    );
    expect(
      isolatedCodexReadablePaths({
        readOnly: false,
        worktreePath: "/worktree",
        gitMetadataRoot: "/git-view/.git",
        dependencyRoot: "/dependencies",
        workerHome: "/worker-home",
        protectedPaths,
      }),
    ).toEqual([
      "/git-view/.git",
      "/dependencies",
      "/worker-home",
      ...protectedPaths,
    ]);
  });
  it.each([
    [1, true, 0],
    [137, true, 0],
    [1, false, 1],
    [null, false, -1],
  ])(
    "normalizes process exit code %s with successfulStop=%s to %s",
    (code, successfulStop, expected) => {
      expect(processExitCode({ code, successfulStop })).toBe(expected);
    },
  );

  it("keeps the writable Codex runtime outside the agent-readable worker home", () => {
    expect(
      isolatedCodexRuntimeConfiguration({
        workerHome: "/var/lib/betterr-me-ralph/worker-home",
        codexHome: "/var/lib/betterr-me-ralph/codex-runtime",
        sourceAuthPath: "/mnt/c/Users/test/.codex/auth.json",
      }),
    ).toEqual({
      environment: ["CODEX_HOME=/var/lib/betterr-me-ralph/codex-runtime"],
      sourceAuthPath: "/mnt/c/Users/test/.codex/auth.json",
      authPath: "/var/lib/betterr-me-ralph/codex-runtime/auth.json",
      configPath: "/var/lib/betterr-me-ralph/codex-runtime/config.toml",
      directoryProvisionCommand: [
        "install",
        "-d",
        "-m",
        "700",
        "-o",
        "65534",
        "-g",
        "65534",
        "/var/lib/betterr-me-ralph/codex-runtime",
      ],
      authInstallCommand: [
        "install",
        "-m",
        "600",
        "-o",
        "65534",
        "-g",
        "65534",
        "/mnt/c/Users/test/.codex/auth.json",
        "/var/lib/betterr-me-ralph/codex-runtime/auth.json",
      ],
      configRemovalCommand: [
        "/bin/rm",
        "-f",
        "/var/lib/betterr-me-ralph/codex-runtime/config.toml",
      ],
    });

    expect(() =>
      isolatedCodexRuntimeConfiguration({
        workerHome: "/var/lib/betterr-me-ralph/worker-home",
        codexHome: "/var/lib/betterr-me-ralph/worker-home/.codex",
        sourceAuthPath: "/mnt/c/Users/test/.codex/auth.json",
      }),
    ).toThrowError("isolated Codex runtime must be outside the agent-readable worker home");
  });

  it.each([
    ["workerHome", "relative-home", "isolated worker home must be an absolute Linux path"],
    ["codexHome", "relative-runtime", "isolated Codex runtime must be an absolute Linux path"],
    [
      "sourceAuthPath",
      "relative-auth.json",
      "isolated source auth path must be an absolute Linux path",
    ],
  ])("rejects a relative isolated runtime %s", (property, value, message) => {
    expect(() =>
      isolatedCodexRuntimeConfiguration({
        workerHome: "/worker-home",
        codexHome: "/codex-runtime",
        sourceAuthPath: "/source/auth.json",
        [property]: value,
      }),
    ).toThrowError(message);
  });

  it("requires both Codex startup events before accepting initialization", () => {
    expect(codexStartupEventsReady("")).toBe(false);
    expect(codexStartupEventsReady('{"type":"thread.started"}\n')).toBe(false);
    expect(
      codexStartupEventsReady(
        '{"type":"thread.started"}\n' + '{"type":"turn.started"}\n',
      ),
    ).toBe(true);
    expect(
      codexStartupEventsReady(
        '{"type":"thread.started"}\n' +
          '{"type":"error","message":"initialization failed"}\n',
      ),
    ).toBe(false);
  });

  it.each([
    [false, false, true],
    [false, true, true],
    [true, false, false],
    [true, true, true],
  ])(
    "installs isolated auth when runtimeExists=%s and sourceIsNewer=%s",
    (runtimeExists, sourceIsNewer, expected) => {
      expect(
        isolatedCodexAuthInstallRequired({ runtimeExists, sourceIsNewer }),
      ).toBe(expected);
    },
  );

  it("rejects non-boolean isolated auth reconciliation evidence", () => {
    expect(() =>
      isolatedCodexAuthInstallRequired({ runtimeExists: "yes", sourceIsNewer: false }),
    ).toThrowError("isolated auth reconciliation evidence must be boolean");
  });

  it("counts a repair only after Codex reports a started session", () => {
    expect(codexSessionStarted("")).toBe(false);
    expect(codexSessionStarted('{"type":"error","message":"init failed"}\n')).toBe(
      false,
    );
    expect(
      codexSessionStarted(
        '{"type":"thread.started","thread_id":"thread-1"}\n' +
          '{"type":"turn.started"}\n',
      ),
    ).toBe(true);
  });

  it("drops WSL Codex processes to an unprivileged identity", () => {
    expect(
      unprivilegedWslCommandArguments({
        home: "/var/lib/betterr-me-ralph/worker-home",
        environment: ["CODEX_HOME=/mnt/c/Users/test/.codex"],
        command: "/usr/local/bin/codex",
        args: ["sandbox"],
      }),
    ).toEqual([
      "/usr/bin/setpriv",
      "--no-new-privs",
      "--bounding-set=-all",
      "--reuid=65534",
      "--regid=65534",
      "--clear-groups",
      "env",
      "HOME=/var/lib/betterr-me-ralph/worker-home",
      "CODEX_HOME=/mnt/c/Users/test/.codex",
      "/usr/local/bin/codex",
      "sandbox",
    ]);
  });

  it.each([
    [
      { home: "relative-home" },
      "unprivileged WSL home must be an absolute Linux path",
    ],
    [
      { command: "relative-command" },
      "unprivileged WSL command must be an absolute Linux path",
    ],
    [
      { environment: [42] },
      "unprivileged WSL environment must contain strings",
    ],
    [{ args: [42] }, "unprivileged WSL arguments must contain strings"],
  ])("rejects an unsafe WSL process boundary: %s", (override, expectedMessage) => {
    expect(() =>
      unprivilegedWslCommandArguments({
        home: "/worker-home",
        environment: [],
        command: "/usr/local/bin/codex",
        args: [],
        ...(override as unknown as Partial<{
          home: string;
          environment: string[];
          command: string;
          args: string[];
        }>),
      }),
    ).toThrowError(new Error(expectedMessage));
  });

  it("probes the effective unprivileged WSL identity", () => {
    expect(unprivilegedWslIdentityProbeArguments("/worker-home")).toEqual([
      "/usr/bin/setpriv",
      "--no-new-privs",
      "--bounding-set=-all",
      "--reuid=65534",
      "--regid=65534",
      "--clear-groups",
      "env",
      "HOME=/worker-home",
      "/bin/sh",
      "-c",
      "/bin/grep -E '^(Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs):' /proc/self/status",
    ]);
    expect(
      unprivilegedWslIdentityIsSafe(
        "Uid:\t65534\t65534\t65534\t65534\n" +
          "Gid:\t65534\t65534\t65534\t65534\n" +
          "Groups:\t \n" +
          "CapInh:\t0000000000000000\n" +
          "CapPrm:\t0000000000000000\n" +
          "CapEff:\t0000000000000000\n" +
          "CapBnd:\t0000000000000000\n" +
          "CapAmb:\t0000000000000000\n" +
          "NoNewPrivs:\t1\n",
      ),
    ).toBe(true);
    expect(
      unprivilegedWslIdentityIsSafe(
        "Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\nGroups:\t0\n" +
          "CapInh:\t0000000000000000\nCapPrm:\t000001ffffffffff\n" +
          "CapEff:\t000001ffffffffff\nCapBnd:\t000001ffffffffff\n" +
          "CapAmb:\t0000000000000000\nNoNewPrivs:\t0\n",
      ),
    ).toBe(false);
    expect(
      unprivilegedWslIdentityIsSafe(
        "Uid:\t65534\t65534\t65534\t65534\n" +
          "Gid:\t65534\t65534\t65534\t65534\n" +
          "Groups:\t1234\nCapInh:\t0000000000000000\n" +
          "CapPrm:\t0000000000000000\nCapEff:\t0000000000000000\n" +
          "CapBnd:\t0000000000000000\nCapAmb:\t0000000000000000\n" +
          "NoNewPrivs:\t1\n",
      ),
    ).toBe(false);
    expect(unprivilegedWslIdentityIsSafe("Uid:\t65534\n")).toBe(false);
  });

  it("pins Sol with high coding, xhigh exhaustive review, and high delta review effort", () => {
    expect(workerCodexModelArguments({ readOnly: false })).toEqual([
      "--model",
      "gpt-5.6-sol",
      "-c",
      'model_reasoning_effort="high"',
    ]);
    expect(
      workerCodexModelArguments({ readOnly: true, reviewKind: "exhaustive" }),
    ).toEqual([
      "--model",
      "gpt-5.6-sol",
      "-c",
      'model_reasoning_effort="xhigh"',
    ]);
    expect(
      workerCodexModelArguments({ readOnly: true, reviewKind: "delta" }),
    ).toEqual([
      "--model",
      "gpt-5.6-sol",
      "-c",
      'model_reasoning_effort="high"',
    ]);
  });

  it("does not use command substitutions that escape the standalone sandbox environment", () => {
    const command = workerGitSmokeCommand("/repository/.git/config");
    expect(command).not.toContain("$(");
    expect(command).toContain("git rev-list --count --all | grep -qx 1");
    expect(command).toContain("! git remote | grep -q .");
  });

  it("exposes one clean baseline when git stdin transport is unavailable", async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-worker-isolation-"),
    );
    const repositoryRoot = path.join(temporaryRoot, "repository");
    const worktreePath = path.join(temporaryRoot, "issue-worktree");
    const workerGitRoot = path.join(temporaryRoot, "worker-git");
    try {
      git(["init", "--initial-branch=main", repositoryRoot]);
      git(["-C", repositoryRoot, "config", "user.name", "Test"]);
      git(["-C", repositoryRoot, "config", "user.email", "test@example.test"]);
      git(["-C", repositoryRoot, "config", "core.autocrlf", "true"]);
      fs.writeFileSync(path.join(repositoryRoot, "tracked.txt"), "first\r\n", "utf8");
      git(["-C", repositoryRoot, "add", "tracked.txt"]);
      git(["-C", repositoryRoot, "commit", "--quiet", "-m", "first"]);
      fs.writeFileSync(path.join(repositoryRoot, "tracked.txt"), "second\r\n", "utf8");
      git(["-C", repositoryRoot, "commit", "--quiet", "-am", "second"]);
      git([
        "-C",
        repositoryRoot,
        "remote",
        "add",
        "origin",
        "https://credential@example.test/private.git",
      ]);
      const baseSha = git(["-C", repositoryRoot, "rev-parse", "HEAD"]).stdout.trim();
      git([
        "-C",
        repositoryRoot,
        "worktree",
        "add",
        "-b",
        "codex/issue-1",
        worktreePath,
        baseSha,
      ]);

      const view = await ensureSanitizedWorkerGitView({
        repositoryRoot,
        worktreePath,
        baseSha,
        workerGitRoot,
        issueNumber: 1,
        git: gitWithoutStdin,
      });
      const workerGit = (args: string[]) =>
        git([
          `--git-dir=${view.gitDirectory}`,
          `--work-tree=${worktreePath}`,
          ...args,
        ]).stdout.trim();

      expect(workerGit(["status", "--porcelain"])).toBe("");
      expect(workerGit(["rev-list", "--count", "--all"])).toBe("1");
      expect(workerGit(["remote"])).toBe("");
      expect(fs.readFileSync(path.join(view.gitDirectory, "config"), "utf8")).not.toContain(
        "credential@example.test",
      );

      fs.rmSync(path.join(view.viewPath, "baseline.json"));
      fs.writeFileSync(path.join(view.gitDirectory, "partial-build"), "stale");
      const recoveredView = await ensureSanitizedWorkerGitView({
        repositoryRoot,
        worktreePath,
        baseSha,
        workerGitRoot,
        issueNumber: 1,
        git,
      });
      expect(fs.existsSync(path.join(recoveredView.gitDirectory, "partial-build"))).toBe(
        false,
      );
      expect(workerGit(["status", "--porcelain"])).toBe("");

      fs.appendFileSync(path.join(worktreePath, "tracked.txt"), "deliberate\r\n");
      expect(workerGit(["status", "--porcelain"])).toBe("M tracked.txt");

      removeSanitizedWorkerGitView(workerGitRoot, 1);
      expect(fs.existsSync(view.viewPath)).toBe(false);
    } finally {
      const resolvedTemporaryRoot = path.resolve(temporaryRoot);
      if (resolvedTemporaryRoot.startsWith(path.resolve(os.tmpdir()))) {
        fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
      }
    }
  });
});
