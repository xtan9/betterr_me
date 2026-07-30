const TERMINAL = new Set([
  "merged",
  "stopped",
  "safety_blocked",
  "verification_failed",
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateOptions({
  runtime,
  mode,
  maxIssues,
  pollIntervalMilliseconds,
  retryDelayMilliseconds,
  maxConsecutiveErrors,
  deadlineEpochMilliseconds,
}) {
  if (
    !runtime ||
    !["run", "inspect", "inspectQueue", "requestStop"].every(
      (method) => typeof runtime[method] === "function",
    )
  ) throw new Error("overnight loop requires the complete Ralph runtime interface");
  if (!["PrOnly", "AutoMerge"].includes(mode)) {
    throw new Error("overnight loop mode failed integrity validation");
  }
  for (const [value, description] of [
    [maxIssues, "issue limit"],
    [pollIntervalMilliseconds, "poll interval"],
    [retryDelayMilliseconds, "retry delay"],
    [maxConsecutiveErrors, "controller retry limit"],
    [deadlineEpochMilliseconds, "deadline"],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`overnight loop ${description} failed integrity validation`);
    }
  }
}

function terminal(issue, mode) {
  return TERMINAL.has(issue.disposition) ||
    (mode === "PrOnly" && issue.disposition === "published");
}

function summary(status, fields) {
  return {
    ...fields,
    stopRequested: status.stopRequested === true,
    issues: Array.isArray(status.issues) ? status.issues : [],
  };
}

export async function runOvernightLoop({
  runtime,
  mode,
  maxIssues,
  pollIntervalMilliseconds = 30_000,
  retryDelayMilliseconds = 30_000,
  maxConsecutiveErrors = 5,
  deadlineEpochMilliseconds,
  now = Date.now,
  sleep = delay,
  onStatus = () => {},
}) {
  validateOptions({
    runtime,
    mode,
    maxIssues,
    pollIntervalMilliseconds,
    retryDelayMilliseconds,
    maxConsecutiveErrors,
    deadlineEpochMilliseconds,
  });
  let status = runtime.inspect();
  let runAttempts = 0;
  let consecutiveErrors = 0;
  let lastError = null;
  const initialIssueNumbers = new Set(
    (status.issues ?? []).filter((issue) => terminal(issue, mode)).map((issue) => issue.number),
  );

  for (;;) {
    if (now() >= deadlineEpochMilliseconds) {
      status = await runtime.requestStop();
      return summary(status, {
        completed: false,
        stopReason: "deadline",
        runAttempts,
        lastError,
      });
    }

    try {
      runAttempts += 1;
      const observed = await runtime.run({
        mode,
        maxIssues: 1,
        deadlineEpochMilliseconds,
      });
      if (!observed || !Array.isArray(observed.issues)) {
        throw new Error("Ralph runtime returned an invalid status");
      }
      status = observed;
      consecutiveErrors = 0;
      lastError = null;
      onStatus({ kind: "status", runAttempts, status });
    } catch (error) {
      consecutiveErrors += 1;
      lastError = error instanceof Error ? error.message : String(error);
      onStatus({ kind: "controller-error", runAttempts, consecutiveErrors, error: lastError });
      if (consecutiveErrors >= maxConsecutiveErrors) {
        status = await runtime.requestStop();
        return summary(status, {
          completed: false,
          stopReason: "retry_exhausted",
          runAttempts,
          lastError,
        });
      }
      await sleep(retryDelayMilliseconds);
      continue;
    }

    if (status.stopRequested) {
      return summary(status, {
        completed: false,
        stopReason: "kill_switch",
        runAttempts,
        lastError,
      });
    }

    const queue = await runtime.inspectQueue();
    if (!queue || !Array.isArray(queue.readyIssueNumbers)) {
      throw new Error("Ralph runtime returned invalid queue evidence");
    }
    const active = status.issues.filter((issue) => !terminal(issue, mode));
    if (
      active.length === 0 &&
      queue.readyIssueNumbers.length === 0 &&
      queue.queueComplete !== false
    ) {
      return summary(status, {
        completed: true,
        stopReason: "queue_complete",
        runAttempts,
        lastError: null,
        queueAudit: queue,
      });
    }
    const handled = new Set(
      status.issues
        .filter((issue) => !initialIssueNumbers.has(issue.number))
        .map((issue) => issue.number),
    );
    if (active.length === 0 && handled.size >= maxIssues) {
      return summary(status, {
        completed: false,
        stopReason: "issue_limit",
        runAttempts,
        lastError: null,
        queueAudit: queue,
      });
    }
    await sleep(pollIntervalMilliseconds);
  }
}
