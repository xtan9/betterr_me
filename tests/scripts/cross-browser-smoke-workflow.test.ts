import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(".github/workflows/cross-browser-smoke.yml"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("scheduled cross-browser smoke workflow", () => {
  it("runs only the bounded smoke contract for every supported compatibility project", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain(
      "project: [firefox, webkit, mobile-chrome, mobile-safari]",
    );
    expect(workflow).toContain(
      "playwright test e2e/cross-browser-smoke.spec.ts --project=\"$SMOKE_PROJECT\"",
    );
    expect(workflow).toContain(
      'playwright install --with-deps chromium "${{ matrix.browser }}"',
    );
    expect(workflow).not.toContain("visual-regression");
    expect(workflow).not.toContain("pnpm test:e2e\n");
  });

  it("isolates state per project and retains per-project retry and flake evidence", () => {
    expect(workflow).toContain(
      "printf 'E2E_RUN_ID=gh-%s-%s-%s\\n' \"$GITHUB_RUN_ID\" \"$GITHUB_RUN_ATTEMPT\" \"$SMOKE_PROJECT\"",
    );
    expect(workflow).toContain("E2E_DATA_MODE=disposable");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("playwright-smoke-${{ matrix.project }}-${{ github.run_id }}");
    expect(workflow).toContain("playwright-report/");
    expect(workflow).toContain("test-results/");
  });
});
