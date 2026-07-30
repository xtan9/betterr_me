import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertBoundArtifact({ artifactPath, expectedPath, rootPath, digest }) {
  if (
    typeof artifactPath !== "string" ||
    !path.isAbsolute(artifactPath) ||
    path.resolve(artifactPath) !== path.resolve(expectedPath)
  ) {
    throw new Error("verification artifact path failed integrity validation");
  }

  let root;
  let resolved;
  let content;
  try {
    root = fs.realpathSync.native(rootPath);
    const metadata = fs.lstatSync(artifactPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("verification artifact is not a regular file");
    }
    resolved = fs.realpathSync.native(artifactPath);
    if (!within(root, resolved)) {
      throw new Error("verification artifact escaped its controller-owned root");
    }
    content = fs.readFileSync(resolved);
  } catch (error) {
    throw new Error("verification artifact failed integrity validation", {
      cause: error,
    });
  }
  if (sha256(content) !== digest) {
    throw new Error("verification artifact digest failed integrity validation");
  }
}

export function assertVerificationArtifacts({
  runtimePath,
  evidence,
  verificationPlan,
  verificationPlanSha256,
}) {
  if (
    typeof runtimePath !== "string" ||
    !path.isAbsolute(runtimePath) ||
    !evidence ||
    !verificationPlan ||
    typeof verificationPlanSha256 !== "string"
  ) {
    throw new Error("verification artifact manifest failed integrity validation");
  }
  const commandRoot = path.join(runtimePath, "verification-gates");
  const commandExecutionKey = sha256(
    `${evidence.sessionId}\0${evidence.candidateTreeSha}\0${verificationPlanSha256}`,
  );
  for (const gate of evidence.tests) {
    assertBoundArtifact({
      artifactPath: gate.outputArtifactPath,
      expectedPath: path.join(
        commandRoot,
        commandExecutionKey,
        `${gate.id}.output.log`,
      ),
      rootPath: commandRoot,
      digest: gate.outputSha256,
    });
  }

  const reviewRoot = path.join(runtimePath, "verification-reviews");
  const reviewExecutionKey = sha256(
    `${verificationPlan.review.sessionId}\0${evidence.candidateTreeSha}\0${verificationPlanSha256}`,
  );
  for (const receipt of evidence.review.specialistReceipts) {
    assertBoundArtifact({
      artifactPath: receipt.resultPath,
      expectedPath: path.join(
        reviewRoot,
        reviewExecutionKey,
        `${receipt.axis}.report.json`,
      ),
      rootPath: reviewRoot,
      digest: receipt.outputSha256,
    });
  }
}
