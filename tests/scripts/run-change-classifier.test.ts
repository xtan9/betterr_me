import { describe, expect, it, vi } from "vitest";

import { runChangeClassifier } from "../../scripts/ci/run-change-classifier.mjs";

describe("change classifier runner", () => {
  it("emits broad structured selection when the classifier cannot load", async () => {
    const write = vi.fn();

    const result = await runChangeClassifier({
      env: {
        ...process.env,
        EVENT_NAME: "pull_request",
        BASE_SHA: "base",
        HEAD_SHA: "head",
      },
      loadClassifier: () => Promise.reject(new SyntaxError("broken classifier")),
      write,
      log: vi.fn(),
    });

    expect(result.fallback).toBe(true);
    expect(result.suites).toMatchObject({
      fullTests: true,
      fullLint: true,
      migrations: true,
      e2eFull: true,
      performance: true,
      architecture: true,
    });
    expect(result.reasons[0]).toContain("classifier startup error");
    expect(write).toHaveBeenCalledWith(expect.stringContaining("classification_json="));
  });
});
