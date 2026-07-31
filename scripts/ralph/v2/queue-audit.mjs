const PRESERVED_BLOCKED_DISPOSITIONS = new Set([
  "safety_blocked",
  "verification_failed",
  "stopped",
]);

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function classifyQueueAudit({ audit, issueRecords, readyIssueNumbers }) {
  if (
    !audit ||
    !Array.isArray(audit.issues) ||
    !issueRecords ||
    typeof issueRecords !== "object" ||
    !Array.isArray(readyIssueNumbers)
  ) throw new Error("queue audit evidence failed integrity validation");

  const closedIssueNumbers = [];
  const nonMergeableIssueNumbers = [];
  const unresolvedIssueNumbers = [];
  const seen = new Set();
  for (const issue of audit.issues) {
    if (
      !Number.isSafeInteger(issue?.number) ||
      issue.number <= 0 ||
      seen.has(issue.number) ||
      !["OPEN", "CLOSED"].includes(issue.state) ||
      !Array.isArray(issue.pullRequests)
    ) throw new Error("queue audit issue evidence failed integrity validation");
    seen.add(issue.number);
    if (issue.state === "CLOSED") {
      closedIssueNumbers.push(issue.number);
      continue;
    }
    const record = issueRecords[issue.number];
    const preservedPullRequest = issue.pullRequests.some(
      (pullRequest) =>
        pullRequest?.number === record?.pullRequestNumber &&
        pullRequest.state === "OPEN",
    );
    const preservedPrivateArtifact = record?.artifactEvidenceValid === true;
    if (
      (preservedPullRequest || preservedPrivateArtifact) &&
      PRESERVED_BLOCKED_DISPOSITIONS.has(record?.disposition)
    ) {
      nonMergeableIssueNumbers.push(issue.number);
    } else {
      unresolvedIssueNumbers.push(issue.number);
    }
  }

  const ready = sortedUnique(readyIssueNumbers);
  return {
    queueComplete: unresolvedIssueNumbers.length === 0 && ready.length === 0,
    closedIssueNumbers: sortedUnique(closedIssueNumbers),
    nonMergeableIssueNumbers: sortedUnique(nonMergeableIssueNumbers),
    unresolvedIssueNumbers: sortedUnique(unresolvedIssueNumbers),
    readyIssueNumbers: ready,
  };
}
