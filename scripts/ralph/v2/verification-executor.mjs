import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { verificationPlanDigest } from "./verification-plan.mjs";

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const GIT_TIMEOUT_MILLISECONDS = 10_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha1(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function writeDurably(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function publishDurably(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const candidatePath = `${filePath}.candidate-${process.pid}-${randomUUID()}`;
  writeDurably(candidatePath, content);
  try {
    fs.linkSync(candidatePath, filePath);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return false;
  } finally {
    fs.rmSync(candidatePath, { force: true });
  }
}

function safeCommandEnvironment() {
  const allowedNames = [
    "ComSpec",
    "LANG",
    "LC_ALL",
    "PATH",
    "PATHEXT",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ];
  const environment = Object.fromEntries(
    allowedNames.flatMap((name) =>
      typeof process.env[name] === "string" ? [[name, process.env[name]]] : [],
    ),
  );
  return { ...environment, CI: "true", NO_COLOR: "1" };
}

function runGit(worktreePath, args) {
  const executable = process.platform === "win32" ? "git.exe" : "git";
  const result = spawnSync(executable, ["-C", worktreePath, ...args], {
    encoding: "utf8",
    env: safeCommandEnvironment(),
    windowsHide: true,
    timeout: GIT_TIMEOUT_MILLISECONDS,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `verification candidate Git inspection failed: ${String(
        result.stderr || result.error?.message || result.status,
      ).trim()}`,
    );
  }
  return result.stdout.trim();
}

function assertCandidateUnchanged(worktreePath, candidateTreeSha) {
  const observedTreeSha = runGit(worktreePath, ["write-tree"]);
  if (observedTreeSha !== candidateTreeSha) {
    throw new Error("verification command changed the staged candidate tree");
  }
  runGit(worktreePath, ["diff", "--quiet"]);
}

function validateGate(gate) {
  if (
    !gate ||
    !nonblank(gate.id) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(gate.id) ||
    !nonblank(gate.executable) ||
    !path.isAbsolute(gate.executable) ||
    gate.executable.includes("\0") ||
    !Array.isArray(gate.args) ||
    gate.args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.includes("\0") ||
        argument.length > 32_768,
    ) ||
    !nonblank(gate.command)
  ) {
    throw new Error("verification gate failed integrity validation");
  }
  return gate;
}

function validateInput(input) {
  if (
    !input ||
    !nonblank(input.sessionId) ||
    !path.isAbsolute(input.worktreePath) ||
    !isSha1(input.candidateTreeSha) ||
    !input.verificationPlan ||
    input.verificationPlan.sessionId !== input.sessionId ||
    input.verificationPlan.candidateTreeSha !== input.candidateTreeSha ||
    !Array.isArray(input.verificationPlan.tests) ||
    input.verificationPlan.tests.length === 0 ||
    !isSha256(input.verificationPlanSha256) ||
    verificationPlanDigest(input.verificationPlan) !==
      input.verificationPlanSha256 ||
    !Number.isSafeInteger(input.deadlineEpochMilliseconds) ||
    input.deadlineEpochMilliseconds <= 0
  ) {
    throw new Error("verification plan digest failed integrity validation");
  }
  input.verificationPlan.tests.forEach(validateGate);
  if (
    new Set(input.verificationPlan.tests.map((gate) => gate.id)).size !==
    input.verificationPlan.tests.length
  ) {
    throw new Error("verification gate IDs failed integrity validation");
  }
  return input;
}

function runExactCommand({ executable, args, cwd, deadlineEpochMilliseconds }) {
  if (Date.now() >= deadlineEpochMilliseconds) {
    throw new Error("verification command deadline expired before launch");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: safeCommandEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("verification command output exceeded limit")));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, signal) =>
      finish(() =>
        resolve({
          exitCode: exitCode ?? (signal ? -1 : 1),
          signal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }),
      ),
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("verification command deadline expired")));
    }, Math.max(1, deadlineEpochMilliseconds - Date.now()));
  });
}

function outputContent(result) {
  return Buffer.concat([
    Buffer.from(
      `[result]\n${JSON.stringify({
        schemaVersion: 1,
        exitCode: result.exitCode,
        signal: result.signal,
      })}\n`,
      "utf8",
    ),
    Buffer.from("[stdout]\n", "utf8"),
    result.stdout,
    Buffer.from("\n[stderr]\n", "utf8"),
    result.stderr,
  ]);
}

function resultFromOutput(output) {
  const prefix = "[result]\n";
  const text = output.toString("utf8");
  if (!text.startsWith(prefix)) {
    throw new Error("verification gate result artifact failed integrity validation");
  }
  const lineEnd = text.indexOf("\n", prefix.length);
  if (lineEnd < 0) {
    throw new Error("verification gate result artifact failed integrity validation");
  }
  let result;
  try {
    result = JSON.parse(text.slice(prefix.length, lineEnd));
  } catch (error) {
    throw new Error("verification gate result artifact failed integrity validation", {
      cause: error,
    });
  }
  if (
    result?.schemaVersion !== 1 ||
    !Number.isSafeInteger(result.exitCode) ||
    (result.signal !== null && typeof result.signal !== "string")
  ) {
    throw new Error("verification gate result artifact failed integrity validation");
  }
  return result;
}

function receiptFromOutput(outputPath, gate, input) {
  let output;
  try {
    output = fs.readFileSync(outputPath);
  } catch (error) {
    throw new Error(`verification gate ${gate.id} artifact failed integrity validation`, {
      cause: error,
    });
  }
  const result = resultFromOutput(output);
  return {
    id: gate.id,
    status: result.exitCode === 0 ? "passed" : "failed",
    candidateTreeSha: input.candidateTreeSha,
    command: gate.command,
    exitCode: result.exitCode,
    outputSha256: sha256(output),
    outputArtifactPath: outputPath,
  };
}

function readReceipt(receiptPath, gateId) {
  try {
    return JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch (error) {
    throw new Error(
      `verification gate ${gateId} receipt failed integrity validation`,
      { cause: error },
    );
  }
}

function gateAttempt(gate, input) {
  return {
    schemaVersion: 1,
    kind: "verification-gate-attempt",
    sessionId: input.sessionId,
    candidateTreeSha: input.candidateTreeSha,
    verificationPlanSha256: input.verificationPlanSha256,
    gateId: gate.id,
    command: gate.command,
  };
}

function readAndValidateAttempt(attemptPath, gate, input) {
  let observed;
  try {
    observed = JSON.parse(fs.readFileSync(attemptPath, "utf8"));
  } catch (error) {
    throw new Error(
      `verification gate ${gate.id} attempt failed integrity validation`,
      { cause: error },
    );
  }
  if (JSON.stringify(observed) !== JSON.stringify(gateAttempt(gate, input))) {
    throw new Error(
      `verification gate ${gate.id} attempt failed integrity validation`,
    );
  }
  return observed;
}

function validateDurableGateReceipt(receipt, gate, input, outputPath) {
  if (
    !receipt ||
    receipt.id !== gate.id ||
    !["passed", "failed"].includes(receipt.status) ||
    receipt.candidateTreeSha !== input.candidateTreeSha ||
    receipt.command !== gate.command ||
    !Number.isSafeInteger(receipt.exitCode) ||
    (receipt.status === "passed"
      ? receipt.exitCode !== 0
      : receipt.exitCode === 0) ||
    !isSha256(receipt.outputSha256) ||
    receipt.outputArtifactPath !== outputPath
  ) {
    throw new Error(`verification gate ${gate.id} receipt failed integrity validation`);
  }
  let output;
  try {
    output = fs.readFileSync(outputPath);
  } catch (error) {
    throw new Error(`verification gate ${gate.id} artifact failed integrity validation`, {
      cause: error,
    });
  }
  if (sha256(output) !== receipt.outputSha256) {
    throw new Error(`verification gate ${gate.id} artifact failed integrity validation`);
  }
  return receipt;
}

export function createVerificationCommandExecutor({
  artifactRoot,
  lifecycle = { checkpoint: async () => {} },
  commandRunner = runExactCommand,
} = {}) {
  if (!nonblank(artifactRoot) || !path.isAbsolute(artifactRoot)) {
    throw new Error("verification artifact root failed integrity validation");
  }
  const resolvedArtifactRoot = path.resolve(artifactRoot);
  if (!lifecycle || typeof lifecycle.checkpoint !== "function") {
    throw new Error("verification lifecycle failed integrity validation");
  }
  if (typeof commandRunner !== "function") {
    throw new Error("verification command runner failed integrity validation");
  }

  return {
    async execute(rawInput) {
      const input = validateInput(rawInput);
      const worktreePath = fs.realpathSync.native(input.worktreePath);
      fs.mkdirSync(resolvedArtifactRoot, { recursive: true });
      const artifactPath = fs.realpathSync.native(resolvedArtifactRoot);
      if (within(worktreePath, artifactPath) || within(artifactPath, worktreePath)) {
        throw new Error("verification artifacts and candidate checkout must be isolated");
      }
      assertCandidateUnchanged(worktreePath, input.candidateTreeSha);
      const executionKey = sha256(
        `${input.sessionId}\0${input.candidateTreeSha}\0${input.verificationPlanSha256}`,
      );
      const executionRoot = path.join(artifactPath, executionKey);
      fs.mkdirSync(executionRoot, { recursive: true });
      const tests = [];

      for (const gate of input.verificationPlan.tests) {
        const outputPath = path.join(executionRoot, `${gate.id}.output.log`);
        const receiptPath = path.join(executionRoot, `${gate.id}.receipt.json`);
        const attemptPath = path.join(executionRoot, `${gate.id}.attempt.json`);
        if (fs.existsSync(receiptPath)) {
          readAndValidateAttempt(attemptPath, gate, input);
          const receipt = readReceipt(receiptPath, gate.id);
          tests.push(
            validateDurableGateReceipt(
              receipt,
              gate,
              input,
              outputPath,
            ),
          );
          continue;
        }
        if (fs.existsSync(outputPath)) {
          readAndValidateAttempt(attemptPath, gate, input);
          const recoveredReceipt = receiptFromOutput(outputPath, gate, input);
          publishDurably(
            receiptPath,
            Buffer.from(`${JSON.stringify(recoveredReceipt, null, 2)}\n`, "utf8"),
          );
          const receipt = readReceipt(receiptPath, gate.id);
          tests.push(
            validateDurableGateReceipt(
              receipt,
              gate,
              input,
              outputPath,
            ),
          );
          await lifecycle.checkpoint({
            point: "verification-gate-completed",
            sessionId: input.sessionId,
            gateId: gate.id,
          });
          continue;
        }
        if (fs.existsSync(attemptPath)) {
          readAndValidateAttempt(attemptPath, gate, input);
          throw new Error(
            `verification gate ${gate.id} has an interrupted admitted attempt`,
          );
        }
        const attempt = gateAttempt(gate, input);
        if (
          !publishDurably(
            attemptPath,
            Buffer.from(`${JSON.stringify(attempt)}\n`, "utf8"),
          )
        ) {
          readAndValidateAttempt(attemptPath, gate, input);
          throw new Error(
            `verification gate ${gate.id} has an interrupted admitted attempt`,
          );
        }
        await lifecycle.checkpoint({
          point: "verification-gate-attempt-admitted",
          sessionId: input.sessionId,
          gateId: gate.id,
        });

        const result = await commandRunner({
          executable: gate.executable,
          args: gate.args,
          cwd: worktreePath,
          deadlineEpochMilliseconds: input.deadlineEpochMilliseconds,
        });
        if (
          !result ||
          !Number.isSafeInteger(result.exitCode) ||
          (result.signal !== null && typeof result.signal !== "string") ||
          !Buffer.isBuffer(result.stdout) ||
          !Buffer.isBuffer(result.stderr) ||
          result.stdout.length + result.stderr.length > MAX_OUTPUT_BYTES
        ) {
          throw new Error("verification command result failed integrity validation");
        }
        assertCandidateUnchanged(worktreePath, input.candidateTreeSha);
        const output = outputContent(result);
        const outputPublished = publishDurably(outputPath, output);
        if (outputPublished) {
          await lifecycle.checkpoint({
            point: "verification-gate-output-published",
            sessionId: input.sessionId,
            gateId: gate.id,
          });
        }
        const receipt = receiptFromOutput(outputPath, gate, input);
        if (!publishDurably(
          receiptPath,
          Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
        )) {
          throw new Error(`verification gate ${gate.id} receipt publication raced`);
        }
        tests.push(
          validateDurableGateReceipt(receipt, gate, input, outputPath),
        );
        await lifecycle.checkpoint({
          point: "verification-gate-completed",
          sessionId: input.sessionId,
          gateId: gate.id,
        });
      }

      assertCandidateUnchanged(worktreePath, input.candidateTreeSha);
      return {
        schemaVersion: 1,
        sessionId: input.sessionId,
        candidateTreeSha: input.candidateTreeSha,
        verificationPlanSha256: input.verificationPlanSha256,
        tests,
      };
    },
  };
}
