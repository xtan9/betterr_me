import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  evaluateSecretExpirations,
  reconcileSecretExpirationIssue,
  secretExpirationIssueBody,
} from "../../scripts/ci/reconcile-secret-expiration-issue.mjs";

function manifest(expiresOn = "2027-07-31") {
  return {
    schema_version: 1,
    defaults: { remind_days: [60, 30, 7] },
    credentials: [{
      id: "vercel-token",
      secret_name: "VERCEL_TOKEN",
      platform: "Vercel",
      expires_on: expiresOn,
      rotation_url: "https://vercel.com/account/settings/tokens",
      scope: "xtan9's projects -> All Projects",
    }],
  };
}

function mockApi(openIssues: Array<{
  number: number;
  title: string;
  body?: string;
  pull_request?: unknown;
}> = []) {
  return {
    listOpenIssues: vi.fn().mockResolvedValue(openIssues),
    availableLabels: vi.fn().mockResolvedValue(["ready-for-human"]),
    createIssue: vi.fn().mockResolvedValue({ number: 123 }),
    updateIssue: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue({}),
    closeIssue: vi.fn().mockResolvedValue({}),
  };
}

const title = "[Maintenance] Rotate expiring repository credentials";

describe("secret expiration evaluation", () => {
  it("tracks the current Vercel token without storing a secret value", () => {
    const configured = JSON.parse(
      readFileSync(".github/secret-expirations.json", "utf8"),
    );

    expect(configured.credentials).toContainEqual(expect.objectContaining({
      secret_name: "VERCEL_TOKEN",
      platform: "Vercel",
      expires_on: "2027-07-31",
    }));
    expect(JSON.stringify(configured)).not.toMatch(/token_value|secret_value/i);
    expect(evaluateSecretExpirations(configured, "2026-07-31").due).toEqual([]);
  });

  it.each([
    ["2027-06-01", 60, "60"],
    ["2027-06-02", 59, "60"],
    ["2027-07-02", 29, "30"],
    ["2027-07-25", 6, "7"],
    ["2027-07-31", 0, "today"],
    ["2027-08-01", -1, "expired"],
  ])("classifies %s in the expected reminder tier", (today, days, tier) => {
    expect(evaluateSecretExpirations(manifest(), today).due[0]).toMatchObject({
      daysRemaining: days,
      tier,
    });
  });

  it("does not report credentials before their reminder window", () => {
    expect(evaluateSecretExpirations(manifest(), "2027-05-31").due).toEqual([]);
  });

  it("rejects malformed metadata instead of silently skipping reminders", () => {
    expect(() => evaluateSecretExpirations({
      ...manifest(),
      credentials: [{ ...manifest().credentials[0], expires_on: "2027-02-30" }],
    }, "2027-01-01")).toThrow("not a valid calendar date");
  });
});

describe("secret expiration issue reconciliation", () => {
  it("creates one human-action issue when a credential enters its window", async () => {
    const api = mockApi();
    const evaluated = evaluateSecretExpirations(manifest(), "2027-06-02");

    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: manifest(),
      today: "2027-06-02",
    })).resolves.toEqual({ action: "created", issueNumber: 123, due: 1 });
    expect(api.createIssue).toHaveBeenCalledWith({
      title,
      body: secretExpirationIssueBody(evaluated),
      labels: ["ready-for-human"],
    });
  });

  it("does not comment repeatedly while the reminder tier is unchanged", async () => {
    const evaluation = evaluateSecretExpirations(manifest(), "2027-06-02");
    const api = mockApi([{
      number: 17,
      title,
      body: secretExpirationIssueBody(evaluation),
    }]);

    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: manifest(),
      today: "2027-06-10",
    })).resolves.toEqual({ action: "unchanged", issueNumber: 17, due: 1 });
    expect(api.updateIssue).not.toHaveBeenCalled();
    expect(api.addComment).not.toHaveBeenCalled();
  });

  it("updates and comments once when a credential reaches a new tier", async () => {
    const oldEvaluation = evaluateSecretExpirations(manifest(), "2027-06-02");
    const api = mockApi([{
      number: 17,
      title,
      body: secretExpirationIssueBody(oldEvaluation),
    }]);

    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: manifest(),
      today: "2027-07-02",
    })).resolves.toEqual({ action: "updated", issueNumber: 17, due: 1 });
    expect(api.updateIssue).toHaveBeenCalledWith(17, {
      body: secretExpirationIssueBody(
        evaluateSecretExpirations(manifest(), "2027-07-02"),
      ),
    });
    expect(api.addComment).toHaveBeenCalledWith(17, expect.stringContaining("escalated"));
  });

  it("updates the issue when displayed rotation metadata changes", async () => {
    const oldEvaluation = evaluateSecretExpirations(manifest(), "2027-06-02");
    const api = mockApi([{
      number: 17,
      title,
      body: secretExpirationIssueBody(oldEvaluation),
    }]);
    const changed = manifest();
    changed.credentials[0].scope = "updated provider scope";

    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: changed,
      today: "2027-06-10",
    })).resolves.toMatchObject({ action: "updated", issueNumber: 17 });
  });

  it("closes the issue after rotation moves every expiration out of range", async () => {
    const api = mockApi([{ number: 17, title }]);

    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: manifest("2028-07-31"),
      today: "2027-08-01",
    })).resolves.toEqual({ action: "closed", issueNumber: 17 });
    expect(api.closeIssue).toHaveBeenCalledWith(17);
  });

  it("stays read-only when all credentials are healthy", async () => {
    const api = mockApi();
    await expect(reconcileSecretExpirationIssue({
      api,
      manifest: manifest(),
      today: "2026-07-31",
    })).resolves.toEqual({ action: "healthy" });
    expect(api.createIssue).not.toHaveBeenCalled();
  });
});
