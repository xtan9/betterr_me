import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readProcessIdentity } from "../../../scripts/ralph/v2/state-store.mjs";
import { createWorkerSessionRegistry } from "../../../scripts/ralph/v2/worker-session-registry.mjs";
import { runGit, writeFileDurably } from "./test-primitives.mjs";

function remainAlive() {
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1_000);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

if (process.argv[2] === "--descendant") {
  remainAlive();
} else {
  const [
    configPath,
    sessionId,
    worktreePath,
    candidateTreeSha,
    verificationPlanSha256,
    encodedVerificationPlan,
  ] = process.argv.slice(2);
  if (
    !configPath ||
    !sessionId ||
    !worktreePath ||
    !candidateTreeSha ||
    !verificationPlanSha256 ||
    !encodedVerificationPlan
  ) {
    throw new Error(
      "usage: durable-verifier-process.mjs <config> <session> <worktree> <tree> <plan-sha256> <plan-base64url>",
    );
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const setting = config.durableVerifier ?? {};
  const verificationPlan = JSON.parse(
    Buffer.from(encodedVerificationPlan, "base64url").toString("utf8"),
  );
  if (
    verificationPlan.sessionId !== sessionId ||
    verificationPlan.candidateTreeSha !== candidateTreeSha ||
    createHash("sha256").update(canonicalJson(verificationPlan)).digest("hex") !==
      verificationPlanSha256
  ) {
    throw new Error("durable verifier received an invalid controller plan");
  }
  const fixtureRoot = path.join(
    path.dirname(config.externalStatePath),
    "durable-verifier",
  );
  const activeDirectory = path.join(fixtureRoot, "active");
  const attachmentDirectory = path.join(fixtureRoot, "attachments");
  const errorDirectory = path.join(fixtureRoot, "errors");
  const receiptDirectory = path.join(fixtureRoot, "receipts");
  const spawnedDirectory = path.join(fixtureRoot, "spawned");
  const startDirectory = path.join(fixtureRoot, "starts");
  const releasePath = path.join(fixtureRoot, "release");
  const ownershipReleasePath = path.join(fixtureRoot, "ownership-release");
  const verifierId = `${process.pid}-${randomUUID()}`;
  const sessionKey = createHash("sha256")
    .update(`${sessionId}\0${candidateTreeSha}`)
    .digest("hex");
  const activePath = path.join(activeDirectory, `${verifierId}.json`);
  const sessionRegistry = createWorkerSessionRegistry(
    path.join(fixtureRoot, "session-registry"),
  );

  function publishImmutableArtifact(filePath, content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const candidatePath = `${filePath}.candidate-${verifierId}`;
    writeFileDurably(candidatePath, bytes);
    try {
      try {
        fs.linkSync(candidatePath, filePath);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    } finally {
      fs.rmSync(candidatePath, { force: true });
    }
    const observed = fs.readFileSync(filePath);
    if (!observed.equals(bytes)) {
      throw new Error("durable verifier artifact changed after publication");
    }
    return createHash("sha256").update(observed).digest("hex");
  }

  function record(directory, value) {
    fs.mkdirSync(directory, { recursive: true });
    writeFileDurably(
      path.join(directory, `${verifierId}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForProcessIdentity(processId) {
    if (!Number.isSafeInteger(processId) || processId <= 0) {
      throw new Error("verifier process ID is unavailable");
    }
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const identity = readProcessIdentity(processId);
      if (identity) return identity;
      await sleep(10);
    }
    throw new Error(
      `verifier process identity was not observable for ${processId}`,
    );
  }

  function testEvidence(id, command) {
    const executionKey = createHash("sha256")
      .update(`${sessionId}\0${candidateTreeSha}\0${verificationPlanSha256}`)
      .digest("hex");
    const outputArtifactPath = path.join(
      config.runtimePath,
      "verification-gates",
      executionKey,
      `${id}.output.log`,
    );
    const outputSha256 = publishImmutableArtifact(
      outputArtifactPath,
      `durable fixture gate ${id} passed for ${candidateTreeSha}\n`,
    );
    return {
      id,
      status: "passed",
      candidateTreeSha,
      command,
      exitCode: 0,
      outputSha256,
      outputArtifactPath,
    };
  }

  function specialistReceipt(axis) {
    const executionKey = createHash("sha256")
      .update(
        `${verificationPlan.review.sessionId}\0${candidateTreeSha}\0${verificationPlanSha256}`,
      )
      .digest("hex");
    const resultPath = path.join(
      config.runtimePath,
      "verification-reviews",
      executionKey,
      `${axis}.report.json`,
    );
    const outputSha256 = publishImmutableArtifact(
      resultPath,
      `${JSON.stringify({ axis, candidateTreeSha })}\n`,
    );
    return {
      axis,
      sessionId: `${verificationPlan.review.sessionId}:${axis}`,
      resultPath,
      outputSha256,
      freshSession: true,
      readOnly: true,
      processTreeTerminated: true,
    };
  }

  function completeEvidence() {
    return {
      schemaVersion: 2,
      sessionId,
      candidateTreeSha,
      verificationPlanSha256,
      tests: verificationPlan.tests.map((test) =>
        testEvidence(test.id, test.command),
      ),
      review: {
        reviewKind: "exhaustive",
        status: "pass",
        complete: true,
        sessionId: verificationPlan.review.sessionId,
        candidateTreeSha,
        policySha256: verificationPlan.review.policySha256,
        skillSha256: verificationPlan.review.skillSha256,
        axes: verificationPlan.review.axes.map((id) => ({
          id,
          complete: true,
          evidenceReviewed: [`${id} evidence for ${candidateTreeSha}`],
          findingIds: [],
        })),
        coverage: verificationPlan.review.coverage.map(
          ({ id, subject }) => ({
            id,
            subject,
            verdict: "pass",
            implementationEvidence: ["candidate diff inspected"],
            testEvidence: ["related and full suites passed"],
          }),
        ),
        findings: [],
        blockingFindings: [],
        repairable: false,
        blockerKind: "none",
        evidenceReviewed: ["issue requirements", "candidate diff", "tests"],
        summary: "All required axes and changed-file coverage passed.",
        specialistReceipts: verificationPlan.review.axes.map(specialistReceipt),
      },
    };
  }

  function failedEvidence() {
    const evidence = completeEvidence();
    const findingId = "SEC-001";
    evidence.review.status = "findings";
    evidence.review.coverage[0].verdict = "findings";
    evidence.review.coverage[0].implementationEvidence = [
      "The candidate leaves a controller-owned finalization boundary open.",
    ];
    evidence.review.findings = [
      {
        id: findingId,
        axis: "security",
        location: "fixture:1",
        problem: "Verifier process tree is still live",
        evidence:
          "A terminal result was published before process-tree death was proven.",
        safeRepair: "Terminate the verifier tree before finalizing evidence.",
      },
    ];
    evidence.review.axes.find(({ id }) => id === "security").findingIds = [
      findingId,
    ];
    evidence.review.blockingFindings = [
      `${findingId}: verifier process tree is still live`,
    ];
    evidence.review.repairable = true;
    evidence.review.blockerKind = "security";
    evidence.review.summary =
      "One blocking security finding requires a fresh repair attempt.";
    return evidence;
  }

  async function waitForOwnerOutcome() {
    const receiptPath = path.join(receiptDirectory, `${sessionKey}.json`);
    const terminationReceiptPath = path.join(
      fixtureRoot,
      "termination-receipts",
      `${sessionKey}.json`,
    );
    const deadline = Date.now() + 25_000;
    while (
      !fs.existsSync(receiptPath) &&
      !fs.existsSync(terminationReceiptPath)
    ) {
      if (Date.now() >= deadline) {
        throw new Error("inert verifier wrapper timed out waiting for its owner");
      }
      await sleep(20);
    }
  }

  function buildReceipt() {
    const failed = setting.behavior === "failed-live-receipt";
    const evidence = failed ? failedEvidence() : completeEvidence();
    const receipt = {
      kind: failed ? "failed" : "passed",
      sessionId,
      candidateTreeSha,
      evidence,
    };
    switch (setting.receiptVariant) {
      case "wrong-session":
        receipt.sessionId = `${sessionId}:wrong`;
        break;
      case "wrong-tree":
        receipt.candidateTreeSha = "0".repeat(40);
        break;
      case "missing-full-suite":
        evidence.tests = evidence.tests.filter(
          (test) => test.id !== "full-suite",
        );
        break;
      case "incomplete-review":
        evidence.review.complete = false;
        evidence.review.axes = evidence.review.axes.filter(
          (axis) => axis.id !== "security",
        );
        break;
      case "wrong-plan-digest":
        evidence.verificationPlanSha256 = "f".repeat(64);
        break;
      case "wrong-test-command":
        evidence.tests.find((test) => test.id === "full-suite").command = "true";
        break;
      case "blank-axis-evidence":
        evidence.review.axes.find(
          (axis) => axis.id === "security",
        ).evidenceReviewed = ["   "];
        break;
      case "placeholder-coverage-evidence":
        evidence.review.coverage[0].implementationEvidence = [null];
        evidence.review.coverage[0].testEvidence = ["   "];
        break;
      case "missing-path-coverage":
        evidence.review.coverage = evidence.review.coverage.slice(0, 1);
        break;
      case "duplicate-path-coverage":
        evidence.review.coverage.push({
          ...evidence.review.coverage[0],
          id: "FILE-DUPLICATE",
        });
        break;
      case "failed-missing-evidence":
        delete receipt.evidence;
        break;
      case "failed-wrong-evidence-session":
        evidence.sessionId = `${sessionId}:forged`;
        break;
      case "failed-wrong-evidence-tree":
        evidence.candidateTreeSha = "0".repeat(40);
        break;
      case "failed-wrong-plan-digest":
        evidence.verificationPlanSha256 = "f".repeat(64);
        break;
      case "failed-unstable-finding-ids":
        evidence.review.findings.push({
          ...evidence.review.findings[0],
        });
        evidence.review.blockingFindings = ["SEC-999: forged finding"];
        break;
      case undefined:
      case "valid":
        break;
      default:
        throw new Error(`unsupported receipt variant ${setting.receiptVariant}`);
    }
    return receipt;
  }

  let descendant;
  try {
    const currentProcessIdentity = readProcessIdentity(process.pid);
    if (!currentProcessIdentity) {
      throw new Error("verifier wrapper process identity is unavailable");
    }
    record(spawnedDirectory, {
      verifierId,
      processId: process.pid,
      processIdentity: currentProcessIdentity,
      parentProcessId: process.ppid,
      sessionId,
      candidateTreeSha,
    });
    if (setting.holdBeforeOwnership === true) {
      const ownershipDeadline = Date.now() + 20_000;
      while (!fs.existsSync(ownershipReleasePath)) {
        if (Date.now() >= ownershipDeadline) {
          throw new Error("verifier wrapper timed out before ownership");
        }
        await sleep(20);
      }
    }

    const ownership = sessionRegistry.claim({
      sessionId: `${sessionId}:${candidateTreeSha}`,
      workerId: verifierId,
      processIdentity: currentProcessIdentity,
    });
    if (!ownership.acquired) {
      record(attachmentDirectory, {
        verifierId,
        processId: process.pid,
        processIdentity: currentProcessIdentity,
        sessionId,
        candidateTreeSha,
        ownerVerifierId: ownership.owner.workerId,
      });
      await waitForOwnerOutcome();
    } else {
      const observedTreeSha = runGit(worktreePath, ["write-tree"])
        .stdout.trim();
      if (observedTreeSha !== candidateTreeSha) {
        throw new Error(
          "verifier received a checkout that does not match its candidate tree",
        );
      }

      const keepsLiveProcessTree = [
        "hung",
        "reject-with-live-tree",
        "invalid-live-receipt",
        "passed-live-receipt",
        "failed-live-receipt",
      ].includes(setting.behavior);
      if (keepsLiveProcessTree) {
        descendant = spawn(
          process.execPath,
          [import.meta.filename, "--descendant"],
          { stdio: "ignore", windowsHide: true },
        );
      }
      const descendantProcessIdentity = descendant
        ? await waitForProcessIdentity(descendant.pid)
        : null;
      const active = {
        verifierId,
        processId: process.pid,
        processIdentity: currentProcessIdentity,
        parentProcessId: process.ppid,
        descendantProcessId: descendant?.pid ?? null,
        descendantProcessIdentity,
        sessionId,
        candidateTreeSha,
      };
      fs.mkdirSync(activeDirectory, { recursive: true });
      writeFileDurably(activePath, `${JSON.stringify(active, null, 2)}\n`);
      record(startDirectory, active);

      if (["hung", "reject-with-live-tree"].includes(setting.behavior)) {
        remainAlive();
        await new Promise(() => {});
      }
      if (setting.behavior === "held-success") {
        const deadline = Date.now() + 20_000;
        while (!fs.existsSync(releasePath)) {
          if (Date.now() >= deadline) {
            throw new Error("verifier timed out waiting for release");
          }
          await sleep(20);
        }
      }

      fs.mkdirSync(receiptDirectory, { recursive: true });
      try {
        writeFileDurably(
          path.join(receiptDirectory, `${sessionKey}.json`),
          `${JSON.stringify(buildReceipt(), null, 2)}\n`,
        );
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      if (
        [
          "invalid-live-receipt",
          "passed-live-receipt",
          "failed-live-receipt",
        ].includes(setting.behavior)
      ) {
        remainAlive();
        await new Promise(() => {});
      }
    }
  } catch (error) {
    record(errorDirectory, {
      verifierId,
      processId: process.pid,
      sessionId,
      candidateTreeSha,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    fs.rmSync(activePath, { force: true });
  }
}
