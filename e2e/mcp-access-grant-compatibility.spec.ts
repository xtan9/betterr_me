import { expect, test } from "@playwright/test";

import {
  REQUIRED_GATE_IDS,
  runMcpAccessGrantCompatibility,
} from "./mcp-access-grant-compatibility";
import { loadMcpAccessGrantConfiguration } from "./mcp-access-grant-target";

test.describe.configure({ mode: "serial" });

const REQUIRED_ISSUE_768_GATES = [
  "refresh-rotation",
  "refresh-replay-containment",
  "grant-identification-revocation",
  "post-revocation-refresh",
  "post-revocation-access",
  "cleanup",
];

const targetConfiguration = loadMcpAccessGrantConfiguration();

for (const target of targetConfiguration.targets) {
  test(`MCP Access Grant compatibility: ${target.name}`, async ({ page }, testInfo) => {
    const report = await runMcpAccessGrantCompatibility(target, page, testInfo, targetConfiguration);

    expect(report.issue).toBe("#768");
    expect(report.gates.length).toBeGreaterThan(0);
    expect(report.gates.map(({ id }) => id)).toEqual(expect.arrayContaining([
      ...REQUIRED_GATE_IDS,
      ...REQUIRED_ISSUE_768_GATES,
    ]));
    expect(report.gates.every(({ status }) =>
      status === "pass" || status === "fail" || status === "not-proven",
    )).toBe(true);
    expect(report.gates.every(({ detail }) => !/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(detail))).toBe(true);

    const rotationGate = report.gates.find(({ id }) => id === "refresh-rotation");
    if (rotationGate?.status === "pass") {
      expect(rotationGate.evidence).toMatchObject({
        firstReplacement: expect.objectContaining({
          accessTokenChanged: true,
          refreshTokenChanged: true,
          providerReturnedAccessToken: true,
          providerReturnedRefreshToken: true,
        }),
      });
    }

    const containmentGate = report.gates.find(({ id }) => id === "refresh-replay-containment");
    if (containmentGate?.status === "pass") {
      expect(containmentGate.evidence).toMatchObject({
        rootReplayDetected: true,
        everyIssuedDescendantRejected: true,
      });
    }

    const grantGate = report.gates.find(({ id }) => id === "grant-identification-revocation");
    if (grantGate?.status === "pass") {
      expect(grantGate.evidence).toMatchObject({
        grant: expect.objectContaining({
          present: true,
          clientId: expect.any(String),
        }),
        revokeEndpointObserved: true,
      });
    }

    const postRefreshGate = report.gates.find(({ id }) => id === "post-revocation-refresh");
    if (postRefreshGate?.status === "pass") {
      expect(postRefreshGate.evidence).toMatchObject({ succeeded: false });
    }

    const postAccessGate = report.gates.find(({ id }) => id === "post-revocation-access");
    if (postAccessGate?.status === "pass") {
      expect(postAccessGate.evidence).toMatchObject({
        operationStatus: expect.stringMatching(/authorized|rejected/),
      });
    }

    const cleanupGate = report.gates.find(({ id }) => id === "cleanup");
    if (cleanupGate?.status === "pass") {
      expect(cleanupGate.evidence).toMatchObject({ grantRevoked: true });
    }
  });
}
