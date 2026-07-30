import path from "node:path";

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function validateTestEvidence(tests, input) {
  const planned = input.verificationPlan.tests;
  if (
    !Array.isArray(tests) ||
    tests.length !== planned.length ||
    !tests.every((gate, index) => {
      const expected = planned[index];
      return (
        gate?.id === expected.id &&
        ["passed", "failed"].includes(gate.status) &&
        gate.candidateTreeSha === input.candidateTreeSha &&
        gate.command === expected.command &&
        Number.isSafeInteger(gate.exitCode) &&
        (gate.status === "passed" ? gate.exitCode === 0 : gate.exitCode !== 0) &&
        isSha256(gate.outputSha256) &&
        nonblank(gate.outputArtifactPath) &&
        path.isAbsolute(gate.outputArtifactPath)
      );
    })
  ) {
    throw new Error("verification command evidence failed integrity validation");
  }
  return tests;
}

function validateReviewEvidence(review, input) {
  const planned = input.verificationPlan.review;
  if (
    !review ||
    review.reviewKind !== "exhaustive" ||
    review.complete !== true ||
    !["pass", "findings"].includes(review.status) ||
    review.sessionId !== planned.sessionId ||
    review.candidateTreeSha !== input.candidateTreeSha ||
    review.policySha256 !== planned.policySha256 ||
    review.skillSha256 !== planned.skillSha256 ||
    !Array.isArray(review.axes) ||
    review.axes.length !== planned.axes.length ||
    !review.axes.every(
      (axis, index) =>
        axis?.id === planned.axes[index] &&
        axis.complete === true &&
        Array.isArray(axis.evidenceReviewed) &&
        axis.evidenceReviewed.length > 0,
    ) ||
    !Array.isArray(review.coverage) ||
    review.coverage.length === 0 ||
    !Array.isArray(review.findings) ||
    !Array.isArray(review.blockingFindings) ||
    !Array.isArray(review.specialistReceipts) ||
    review.specialistReceipts.length !== planned.axes.length ||
    !review.specialistReceipts.every(
      (receipt, index) =>
        receipt?.axis === planned.axes[index] &&
        receipt.sessionId === `${planned.sessionId}:${planned.axes[index]}` &&
        receipt.freshSession === true &&
        receipt.readOnly === true &&
        receipt.processTreeTerminated === true &&
        isSha256(receipt.outputSha256) &&
        nonblank(receipt.resultPath) &&
        path.isAbsolute(receipt.resultPath),
    ) ||
    (review.status === "pass" &&
      (review.findings.length !== 0 || review.blockingFindings.length !== 0)) ||
    (review.status === "findings" && review.blockingFindings.length === 0)
  ) {
    throw new Error("exhaustive review evidence failed integrity validation");
  }
  return review;
}

export function createVerificationPipeline({
  commandExecutor,
  reviewExecutor,
  verificationWorkspace,
  lifecycle = { checkpoint: async () => {} },
} = {}) {
  if (
    !commandExecutor ||
    typeof commandExecutor.execute !== "function" ||
    !reviewExecutor ||
    typeof reviewExecutor.execute !== "function" ||
    !verificationWorkspace ||
    typeof verificationWorkspace.prepare !== "function" ||
    typeof verificationWorkspace.cleanup !== "function"
  ) {
    throw new Error("verification pipeline boundaries failed integrity validation");
  }
  if (!lifecycle || typeof lifecycle.checkpoint !== "function") {
    throw new Error("verification pipeline lifecycle failed integrity validation");
  }

  return {
    async execute(input) {
      const workspaceReceipt = await verificationWorkspace.prepare({
        sessionId: input.sessionId,
        baseSha: input.baseSha,
        candidateTreeSha: input.candidateTreeSha,
      });
      const isolatedInput = {
        ...input,
        worktreePath: workspaceReceipt.worktreePath,
      };
      try {
        const commandEvidence = await commandExecutor.execute(isolatedInput);
        if (
          commandEvidence?.schemaVersion !== 1 ||
          commandEvidence.sessionId !== input.sessionId ||
          commandEvidence.candidateTreeSha !== input.candidateTreeSha ||
          commandEvidence.verificationPlanSha256 !==
            input.verificationPlanSha256
        ) {
          throw new Error(
            "verification command evidence failed integrity validation",
          );
        }
        const tests = validateTestEvidence(commandEvidence.tests, isolatedInput);
        await lifecycle.checkpoint({
          point: "verification-commands-completed",
          sessionId: input.sessionId,
        });

        const review = validateReviewEvidence(
          await reviewExecutor.execute({ ...isolatedInput, testEvidence: tests }),
          isolatedInput,
        );
        await lifecycle.checkpoint({
          point: "verification-review-completed",
          sessionId: input.sessionId,
        });
        const evidence = {
          schemaVersion: 2,
          sessionId: input.sessionId,
          candidateTreeSha: input.candidateTreeSha,
          verificationPlanSha256: input.verificationPlanSha256,
          tests,
          review,
        };
        const failed =
          tests.some((gate) => gate.status === "failed") ||
          review.status === "findings";
        return {
          kind: failed ? "failed" : "passed",
          sessionId: input.sessionId,
          candidateTreeSha: input.candidateTreeSha,
          evidence,
        };
      } finally {
        await verificationWorkspace.cleanup(workspaceReceipt);
      }
    },
  };
}
