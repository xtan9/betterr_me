import { pathToFileURL } from "node:url";

const ACCEPTED_VERCEL_STATES = new Set(["success"]);
const FAILED_VERCEL_STATES = new Set(["error", "failure"]);

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function waitForVercelDeployment({
  repository,
  sha,
  token,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  intervalMs = 10_000,
  timeoutMs = 12 * 60_000,
}) {
  if (!repository || !sha || !token) {
    throw new Error("repository, sha, and token are required");
  }

  const deadline = Date.now() + timeoutMs;
  const statusUrl = `https://api.github.com/repos/${repository}/commits/${sha}/status`;

  while (Date.now() < deadline) {
    const response = await fetchImpl(statusUrl, {
      headers: githubHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`GitHub status API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const status = payload.statuses?.find((candidate) => candidate.context === "Vercel");

    if (status && FAILED_VERCEL_STATES.has(status.state)) {
      throw new Error(`Vercel deployment failed: ${status.description || status.state}`);
    }

    if (status && ACCEPTED_VERCEL_STATES.has(status.state)) {
      const skipped = /ignored build step|canceled/i.test(status.description || "");
      return { skipped, status };
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for Vercel status on ${sha}`);
}

export async function smokeProduction({ appUrl, fetchImpl = fetch }) {
  if (!appUrl) throw new Error("APP_URL is required");

  const checks = [];
  for (const path of ["/", "/auth/login"]) {
    const url = new URL(path, appUrl);
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    if (!response.ok || !/<html[\s>]/i.test(body)) {
      throw new Error(`${url} returned an invalid HTML response (${response.status})`);
    }
    checks.push({ path, status: response.status });
  }

  return checks;
}

export async function runProductionSmoke(options) {
  const deployment = await waitForVercelDeployment(options);
  if (deployment.skipped) {
    return { action: "skipped", reason: deployment.status.description };
  }

  const checks = await smokeProduction(options);
  return { action: "checked", checks };
}

async function main() {
  const options = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    token: process.env.GH_TOKEN,
    appUrl: process.env.APP_URL,
  };
  const result = process.argv.includes("--probe")
    ? { action: "checked", checks: await smokeProduction(options) }
    : await runProductionSmoke(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
