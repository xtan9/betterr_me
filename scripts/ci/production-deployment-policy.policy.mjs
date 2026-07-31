import assert from "node:assert/strict";
import test from "node:test";

import { planProductionDeployment } from "./production-deployment-policy.mjs";

const base = {
  triggerSha: "abc123",
  currentMainSha: "abc123",
  e2eStatus: "success",
};

test("deployment policy skips known non-runtime-only changes", () => {
  assert.equal(
    planProductionDeployment({
      ...base,
      changedFiles: ["docs/deployment.md", ".github/workflows/ci.yml"],
    }).action,
    "skip",
  );
});

test("deployment policy deploys runtime and unfamiliar changes", () => {
  assert.equal(
    planProductionDeployment({
      ...base,
      changedFiles: ["app/page.tsx"],
    }).action,
    "deploy",
  );
  assert.equal(
    planProductionDeployment({
      ...base,
      changedFiles: ["new-runtime/entry.ts"],
    }).action,
    "deploy",
  );
});

test("deployment policy deploys when comparison data is empty", () => {
  assert.equal(
    planProductionDeployment({
      ...base,
      changedFiles: [],
    }).action,
    "deploy",
  );
});

test("deployment policy rejects a failed E2E prerequisite", () => {
  assert.throws(
    () =>
      planProductionDeployment({
        ...base,
        changedFiles: ["app/page.tsx"],
        e2eStatus: "failure",
      }),
    /requires E2E Gate to succeed/,
  );
});
