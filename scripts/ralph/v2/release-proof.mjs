import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, "../../..");
const manifestPath = path.join(scriptRoot, "release-matrix.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const entries = Object.entries(manifest).flatMap(([area, scenarios]) =>
  scenarios.map(([scenarioId, requirement, testFile, testName, evidence]) => ({
    area, scenarioId, requirement, testFile, testName, evidence,
  })),
);
const testFiles = [...new Set(entries.map((entry) => entry.testFile))].sort();
const suppliedReportIndex = process.argv.indexOf("--report");
const suppliedReport = suppliedReportIndex >= 0
  ? path.resolve(process.argv[suppliedReportIndex + 1] ?? "")
  : null;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-release-proof-"));
const reportPath = suppliedReport ?? path.join(root, "vitest-report.json");
try {
  if (!suppliedReport) {
    const vitestPath = path.join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
    const run = spawnSync(process.execPath, [
      vitestPath,
      "run",
      "--config", path.join(repositoryRoot, "scripts", "ralph", "vitest.system.config.mjs"),
      "--reporter=json",
      `--outputFile=${reportPath}`,
      ...testFiles,
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 1_200_000,
    });
    if (run.error || run.signal || run.status !== 0) {
      throw new Error(`release proof suite failed: ${run.stderr || run.error?.message || run.status}`);
    }
  } else if (!fs.statSync(reportPath).isFile()) {
    throw new Error("supplied Vitest release report is not a file");
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const assertions = (report.testResults ?? []).flatMap((result) =>
    (result.assertionResults ?? []).map((assertion) => ({
      file: path.relative(repositoryRoot, result.name).replaceAll("\\", "/"),
      title: assertion.fullName ?? assertion.title ?? "",
      status: assertion.status,
    })),
  );
  const scenarios = entries.map((entry) => {
    const assertion = assertions.find((candidate) =>
      candidate.file === entry.testFile && candidate.title.includes(entry.testName),
    );
    if (!assertion || assertion.status !== "passed") {
      throw new Error(`release scenario ${entry.scenarioId} lacks a passed executed test`);
    }
    return { ...entry, status: "passed", executedTest: assertion.title };
  });
  const receipt = {
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    testFiles,
    scenarioCount: scenarios.length,
    scenarios,
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

if (import.meta.url !== pathToFileURL(process.argv[1]).href) {
  throw new Error("release proof must run as a script");
}
