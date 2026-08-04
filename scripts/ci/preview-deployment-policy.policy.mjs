import assert from "node:assert/strict";
import test from "node:test";

import { planPreviewDeployment } from "./preview-deployment-policy.mjs";

test("preview policy requests runtime changes", () => {
  assert.equal(
    planPreviewDeployment({ changedFiles: ["app/page.tsx"] }).action,
    "request",
  );
});

test("preview policy skips docs, tests, scripts, CI, and database changes", () => {
  for (const file of [
    "docs/deployment.md",
    "tests/app/page.test.tsx",
    "scripts/ci/preview-deployment-policy.mjs",
    ".github/workflows/ci.yml",
    "supabase/migrations/20260803000000_change.sql",
  ]) {
    assert.equal(
      planPreviewDeployment({ changedFiles: [file] }).action,
      "skip",
      file,
    );
  }
});

test("preview policy requires exact successful checks and explicit fork authorization", () => {
  assert.equal(
    planPreviewDeployment({
      changedFiles: ["app/page.tsx"],
      requestedSha: "head-1",
      testedSha: "head-1",
      ciStatus: "success",
      e2eStatus: "success",
      fork: true,
    }).action,
    "skip",
  );
  assert.equal(
    planPreviewDeployment({
      changedFiles: ["app/page.tsx"],
      requestedSha: "head-2",
      testedSha: "head-1",
    }).action,
    "skip",
  );
});

test("preview policy suppresses a second dispatch for a commit", () => {
  assert.equal(
    planPreviewDeployment({
      alreadyDispatched: true,
      changedFiles: ["app/page.tsx"],
    }).action,
    "skip",
  );
});
