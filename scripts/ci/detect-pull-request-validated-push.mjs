/**
 * @param {{
 *   branch: string,
 *   commitSha: string,
 *   listCheckRunsForRef: (parameters: {
 *     owner: string,
 *     repo: string,
 *     ref: string,
 *     per_page: number,
 *   }) => Promise<{ data: { check_runs: Array<{
 *     conclusion: string | null,
 *     name: string,
 *     status: string,
 *   }> } }>,
 *   listPullRequestsAssociatedWithCommit: (parameters: {
 *     owner: string,
 *     repo: string,
 *     commit_sha: string,
 *     per_page: number,
 *   }) => Promise<{ data: Array<{
 *     base: { ref: string },
 *     head: { sha: string },
 *     merged_at: string | null,
 *   }> }>,
 *   owner: string,
 *   repo: string,
 * }} options
 */
export async function detectPullRequestValidatedPush({
  branch,
  commitSha,
  listCheckRunsForRef,
  listPullRequestsAssociatedWithCommit,
  owner,
  repo,
}) {
  const { data: pullRequests } =
    await listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commitSha,
      per_page: 100,
    });

  const mergedPullRequests = pullRequests.filter((pullRequest) =>
    Boolean(pullRequest.merged_at) && pullRequest.base.ref === branch
  );

  for (const pullRequest of mergedPullRequests) {
    const { data: checks } = await listCheckRunsForRef({
      owner,
      repo,
      ref: pullRequest.head.sha,
      per_page: 100,
    });
    const pullRequestGates = checks.check_runs.filter(
      (checkRun) => checkRun.name === "PR Gate",
    );
    if (
      pullRequestGates.length >= 2
      && pullRequestGates.every((checkRun) =>
        checkRun.status === "completed" && checkRun.conclusion === "success"
      )
    ) {
      return true;
    }
  }

  return false;
}
