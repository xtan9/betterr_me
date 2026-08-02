import { expect, test } from "@playwright/test";

import {
  loadMcpAccessGrantTargets,
  REQUIRED_GATE_IDS,
  runMcpAccessGrantCompatibility,
} from "./mcp-access-grant-compatibility";

test.describe.configure({ mode: "serial" });

for (const target of loadMcpAccessGrantTargets()) {
  test(`MCP Access Grant compatibility: ${target.name}`, async ({ page }, testInfo) => {
    const report = await runMcpAccessGrantCompatibility(target, page, testInfo);

    expect(report.issue).toBe("#766");
    expect(report.gates.length).toBeGreaterThan(0);
    for (const gateId of REQUIRED_GATE_IDS) {
      expect(report.gates.some(({ id }) => id === gateId)).toBe(true);
    }
    expect(report.gates.every(({ status }) =>
      status === "pass" || status === "fail" || status === "not-proven",
    )).toBe(true);
    expect(report.gates.every(({ detail }) => !/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(detail))).toBe(true);
  });
}
