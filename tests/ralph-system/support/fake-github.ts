type ReadyIssue = {
  number: number;
  title: string;
  body: string;
};

export function createFakeGitHub(issues: ReadyIssue[]) {
  const claims: Array<{ issueNumber: number; operationId: string }> = [];
  const claimRequests: Array<{ issueNumber: number; operationId: string }> = [];
  const pullRequestRequests: Array<{ issueNumber: number; operationId: string }> = [];
  const pullRequests: Array<{
    number: number;
    issueNumber: number;
    draft: boolean;
    title: string;
    body: string;
    headBranch: string;
    headSha: string;
    baseBranch: string;
  }> = [];

  return {
    async listReadyIssues() {
      return structuredClone(issues);
    },
    async claimIssue(input: { issueNumber: number; operationId: string }) {
      claimRequests.push(input);
      const existing = claims.find(
        (claim) => claim.operationId === input.operationId,
      );
      if (!existing) claims.push(input);
      return { claimed: true };
    },
    async findPullRequest(input: { headBranch: string }) {
      return (
        pullRequests.find((pullRequest) =>
          pullRequest.headBranch === input.headBranch
        ) ?? null
      );
    },
    async createDraftPullRequest(input: {
      issueNumber: number;
      title: string;
      body: string;
      headBranch: string;
      headSha: string;
      baseBranch: string;
      operationId: string;
    }) {
      pullRequestRequests.push({
        issueNumber: input.issueNumber,
        operationId: input.operationId,
      });
      const existing = pullRequests.find(
        (pullRequest) => pullRequest.headBranch === input.headBranch,
      );
      if (existing) return existing;

      const pullRequest = {
        number: pullRequests.length + 1,
        issueNumber: input.issueNumber,
        draft: true,
        title: input.title,
        body: input.body,
        headBranch: input.headBranch,
        headSha: input.headSha,
        baseBranch: input.baseBranch,
      };
      pullRequests.push(pullRequest);
      return pullRequest;
    },
    inspect() {
      return structuredClone({
        claims,
        claimRequests,
        pullRequests,
        pullRequestRequests,
      });
    },
  };
}
