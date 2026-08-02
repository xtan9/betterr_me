import { expect, test } from "@playwright/test";

import {
  loadMcpAccessGrantTargets,
  runMcpAccessGrantCompatibility,
} from "./mcp-access-grant-compatibility";

test.describe.configure({ mode: "serial" });

for (const target of loadMcpAccessGrantTargets()) {
  test(`MCP Access Grant compatibility: ${target.name}`, async ({ page }, testInfo) => {
    const report = await runMcpAccessGrantCompatibility(target, page, testInfo);

    expect(report.gates.length).toBeGreaterThan(0);
    expect(report.gates.every(({ status }) =>
      status === "pass" || status === "fail" || status === "not-proven",
    )).toBe(true);
  });
}
