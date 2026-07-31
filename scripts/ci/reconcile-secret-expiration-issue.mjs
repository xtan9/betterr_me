import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ISSUE_TITLE = "[Maintenance] Rotate expiring repository credentials";
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, field) {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} is not a valid calendar date`);
  }
  return date;
}

function validateThresholds(value, field) {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((day) => !Number.isInteger(day) || day <= 0)) {
    throw new Error(`${field} must be a non-empty array of positive integers`);
  }
  return [...new Set(value)].sort((a, b) => b - a);
}

function reminderTier(daysRemaining, thresholds) {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining === 0) return "today";
  const reached = thresholds.filter((threshold) => daysRemaining <= threshold);
  return reached.length === 0 ? null : String(reached.at(-1));
}

export function evaluateSecretExpirations(manifest, todayValue) {
  if (manifest?.schema_version !== 1) {
    throw new Error("secret expiration manifest schema_version must be 1");
  }
  if (!Array.isArray(manifest.credentials)) {
    throw new Error("secret expiration manifest credentials must be an array");
  }

  const today = parseDate(todayValue, "today");
  const defaultThresholds = validateThresholds(
    manifest.defaults?.remind_days,
    "defaults.remind_days",
  );
  const seenIds = new Set();

  const credentials = manifest.credentials.map((credential, index) => {
    const field = `credentials[${index}]`;
    for (const required of ["id", "secret_name", "platform", "expires_on", "rotation_url"]) {
      if (typeof credential?.[required] !== "string" || credential[required].trim() === "") {
        throw new Error(`${field}.${required} must be a non-empty string`);
      }
    }
    if (seenIds.has(credential.id)) throw new Error(`${field}.id must be unique`);
    seenIds.add(credential.id);

    let rotationUrl;
    try {
      rotationUrl = new URL(credential.rotation_url);
    } catch {
      throw new Error(`${field}.rotation_url must be a valid URL`);
    }
    if (rotationUrl.protocol !== "https:") {
      throw new Error(`${field}.rotation_url must use HTTPS`);
    }

    const thresholds = credential.remind_days
      ? validateThresholds(credential.remind_days, `${field}.remind_days`)
      : defaultThresholds;
    const expiration = parseDate(credential.expires_on, `${field}.expires_on`);
    const daysRemaining = Math.round((expiration.valueOf() - today.valueOf()) / DAY_MS);

    return {
      id: credential.id,
      secretName: credential.secret_name,
      platform: credential.platform,
      expiresOn: credential.expires_on,
      rotationUrl: credential.rotation_url,
      scope: typeof credential.scope === "string" ? credential.scope : "",
      daysRemaining,
      tier: reminderTier(daysRemaining, thresholds),
    };
  });

  return {
    today: todayValue,
    due: credentials.filter((credential) => credential.tier !== null),
  };
}

function stateFingerprint(evaluation) {
  const state = evaluation.due.map((credential) => ({
    id: credential.id,
    secretName: credential.secretName,
    platform: credential.platform,
    expiresOn: credential.expiresOn,
    rotationUrl: credential.rotationUrl,
    scope: credential.scope,
    tier: credential.tier,
  }));
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function stateMarker(evaluation) {
  return `<!-- secret-expiration-state:${stateFingerprint(evaluation)} -->`;
}

function daysDescription(days) {
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  if (days === 0) return "expires today";
  return `${days} day(s) remaining`;
}

export function secretExpirationIssueBody(evaluation) {
  const rows = evaluation.due.map((credential) => [
    `\`${credential.secretName}\``,
    credential.platform,
    credential.expiresOn,
    daysDescription(credential.daysRemaining),
    `[Rotate](${credential.rotationUrl})`,
  ].join(" | "));
  const scopes = evaluation.due
    .filter((credential) => credential.scope)
    .map((credential) => `- \`${credential.secretName}\`: ${credential.scope}`);

  return [
    stateMarker(evaluation),
    "## Action required",
    "Rotate the credentials below, replace the corresponding GitHub Actions secrets, and update `.github/secret-expirations.json` with each new expiration date.",
    "",
    `Checked on **${evaluation.today}**. Secret values are never read or stored by this reminder.`,
    "",
    "Credential | Platform | Expires | Status | Rotation",
    "--- | --- | --- | --- | ---",
    ...rows,
    ...(scopes.length > 0 ? ["", "## Expected scopes", ...scopes] : []),
    "",
    "## Completion",
    "After rotation, update the manifest in the same pull request. This issue closes automatically once no declared credential is inside its reminder window.",
    "",
    "This issue is maintained by the repository-scoped Secret Expiration Reminders workflow.",
  ].join("\n");
}

function issueStateMatches(issue, evaluation) {
  return typeof issue.body === "string" && issue.body.includes(stateMarker(evaluation));
}

export async function reconcileSecretExpirationIssue({ api, manifest, today }) {
  const evaluation = evaluateSecretExpirations(manifest, today);
  const openIssues = await api.listOpenIssues();
  const existing = openIssues.find(
    (issue) => !issue.pull_request && issue.title === ISSUE_TITLE,
  );

  if (evaluation.due.length === 0) {
    if (!existing) return { action: "healthy" };
    await api.addComment(
      existing.number,
      `Resolved on ${today}: no declared credential is inside its reminder window.`,
    );
    await api.closeIssue(existing.number);
    return { action: "closed", issueNumber: existing.number };
  }

  const body = secretExpirationIssueBody(evaluation);
  if (!existing) {
    const labels = await api.availableLabels(["ready-for-human"]);
    const issue = await api.createIssue({ title: ISSUE_TITLE, body, labels });
    return { action: "created", issueNumber: issue.number, due: evaluation.due.length };
  }

  if (issueStateMatches(existing, evaluation)) {
    return { action: "unchanged", issueNumber: existing.number, due: evaluation.due.length };
  }

  await api.updateIssue(existing.number, { body });
  await api.addComment(
    existing.number,
    `Reminder escalated on ${today}; expiration dates or reminder tiers changed.`,
  );
  return { action: "updated", issueNumber: existing.number, due: evaluation.due.length };
}

export function createGitHubIssueApi({ repository, token, fetchImpl = fetch }) {
  const [owner, repo] = repository?.split("/") ?? [];
  if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  if (!token) throw new Error("Missing GH_TOKEN");

  async function request(path, options = {}) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  return {
    async listOpenIssues() {
      const issues = [];
      for (let page = 1; ; page += 1) {
        const batch = await request(
          `/repos/${owner}/${repo}/issues?state=open&per_page=100&page=${page}`,
        );
        issues.push(...batch);
        if (batch.length < 100) return issues;
      }
    },
    async availableLabels(labels) {
      const available = [];
      for (const label of labels) {
        const response = await fetchImpl(
          `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`,
          {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
        if (response.ok) available.push(label);
        else if (response.status !== 404) {
          throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
        }
      }
      return available;
    },
    createIssue(issue) {
      return request(`/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issue),
      });
    },
    updateIssue(issueNumber, issue) {
      return request(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issue),
      });
    },
    addComment(issueNumber, body) {
      return request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    },
    closeIssue(issueNumber) {
      return request(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
    },
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const manifestPath = argumentValue("--manifest") ?? ".github/secret-expirations.json";
  const today = argumentValue("--today") ?? new Date().toISOString().slice(0, 10);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const api = createGitHubIssueApi({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
  });
  const result = await reconcileSecretExpirationIssue({ api, manifest, today });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
