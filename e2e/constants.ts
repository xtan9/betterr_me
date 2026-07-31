import { randomUUID } from 'node:crypto';
import { createRunContext } from './run-context';

const externalRunId = process.env.E2E_RUN_ID
  ?? (process.env.GITHUB_RUN_ID
    ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : undefined);

export const RUN_CONTEXT = createRunContext(externalRunId ?? `local-${randomUUID()}`);

// playwright.config.ts loads this module before worker processes are spawned,
// so locally generated identities are inherited by every worker in the run.
process.env.E2E_RUN_ID = RUN_CONTEXT.runId;

export const STORAGE_STATE = RUN_CONTEXT.storageStatePath;
export const FIXTURE_REGISTRY = RUN_CONTEXT.registryPath;
export const E2E_DATA_MODE = process.env.E2E_DATA_MODE ?? 'read-only';
if (E2E_DATA_MODE !== 'read-only' && E2E_DATA_MODE !== 'disposable') {
  throw new Error('E2E_DATA_MODE must be either "read-only" or "disposable"');
}
export const E2E_READ_ONLY = E2E_DATA_MODE === 'read-only';

export const SEED_HABIT_NAMES = [
  RUN_CONTEXT.ownedName('Seed Habit 1'),
  RUN_CONTEXT.ownedName('Seed Habit 2'),
  RUN_CONTEXT.ownedName('Seed Habit 3'),
] as const;

export const SEED_TASK_TITLE = RUN_CONTEXT.ownedName('Seed Task 1');
