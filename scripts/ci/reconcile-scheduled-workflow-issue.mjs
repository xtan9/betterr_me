import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FAILURE_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "stale",
  "startup_failure",
  "timed_out",
]);

export function scheduledFailureIssueTitle(workflowName) {
  return `[Bug] Scheduled ${workflowName} workflow failed`;
}

function runLine(run) {
  return `Run [#${run.run_number}](${run.html_url}) finished with \`${run.conclusion}\` at ${run.updated_at}.`;
}

export function scheduledFailureIssueBody(run) {
  return [
    "## Description",
    `The scheduled **${run.name}** workflow did not complete successfully.`,
    "",
    "## Steps to Reproduce",
    `1. Open [workflow run #${run.run_number}](${run.html_url}).`,
    "2. Inspect the failed job and step logs.",
    "",
    "## Expected Behavior",
    "The scheduled workflow completes successfully on the default branch.",
    "",
    "## Actual Behavior",
    runLine(run),
    "",
    "## Environment",
    `- Workflow: ${run.name}`,
    `- Branch: ${run.head_branch}`,
    `- Commit: \`${run.head_sha}\``,
    `- Trigger: ${run.event}`,
    "",
    "## Screenshots/Logs",
    `[Open the GitHub Actions logs](${run.html_url})`,
    "",
    "## Additional Context",
    "This issue is maintained automatically. Repeated failures are added as comments, and the issue closes after the next successful scheduled run.",
  ].join("\n");
}

export async function reconcileScheduledWorkflowIssue({ api, run }) {
  if (run.event !== "schedule") return { action: "ignored" };

  const title = scheduledFailureIssueTitle(run.name);
  const openIssues = await api.listOpenIssues();
  const existing = openIssues.find(
    (issue) => !issue.pull_request && issue.title === title,
  );

  if (run.conclusion === "success") {
    if (!existing) return { action: "healthy" };
    await api.addComment(
      existing.number,
      `Recovered: ${runLine(run)} Closing this automated alert.`,
    );
    await api.closeIssue(existing.number);
    return { action: "closed", issueNumber: existing.number };
  }

  if (!FAILURE_CONCLUSIONS.has(run.conclusion)) {
    return { action: "ignored" };
  }

  if (existing) {
    await api.addComment(existing.number, `Still failing: ${runLine(run)}`);
    return { action: "commented", issueNumber: existing.number };
  }

  const hasTriageLabel = await api.hasLabel("needs-triage");
  const issue = await api.createIssue({
    title,
    body: scheduledFailureIssueBody(run),
    labels: hasTriageLabel ? ["needs-triage"] : [],
  });
  return { action: "created", issueNumber: issue.number };
}

export function createGitHubIssueApi({ repository, token, fetchImpl = fetch }) {
  const [owner, repo] = repository.split("/");
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
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`GitHub API ${response.status}: ${details}`);
    }
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
    async hasLabel(label) {
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
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
      return true;
    },
    createIssue(issue) {
      return request(`/repos/${owner}/${repo}/issues`, {
        method: "POST",
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

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const run = event.workflow_run;
  if (!run) throw new Error("workflow_run payload is missing");

  const api = createGitHubIssueApi({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
  });
  const result = await reconcileScheduledWorkflowIssue({ api, run });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
