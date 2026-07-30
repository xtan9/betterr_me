function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function createExhaustiveReviewCoverage(issue, changedFiles) {
  if (
    !issue ||
    !Number.isSafeInteger(issue.issueNumber) ||
    issue.issueNumber <= 0 ||
    !nonblank(issue.whatToBuild) ||
    !nonblank(issue.testSeam) ||
    !Array.isArray(issue.acceptanceCriteria) ||
    issue.acceptanceCriteria.length === 0 ||
    !issue.acceptanceCriteria.every(nonblank) ||
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0 ||
    !changedFiles.every(nonblank)
  ) {
    throw new Error("exhaustive review coverage failed integrity validation");
  }
  return [
    { id: "SCOPE", subject: issue.whatToBuild },
    { id: "TEST-SEAM", subject: issue.testSeam },
    ...issue.acceptanceCriteria.map((criterion, index) => ({
      id: `AC-${index + 1}`,
      subject: criterion,
    })),
    ...changedFiles.map((file, index) => ({
      id: `FILE-${index + 1}`,
      subject: file,
    })),
  ];
}
