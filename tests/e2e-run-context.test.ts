import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupRegisteredFixtures,
  createRunContext,
  readRegisteredFixtureIds,
  registerFixtureId,
} from '@/e2e/run-context';

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'betterr-e2e-run-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('functional E2E run context', () => {
  it('gives each run a distinct identity, fixture namespace, and storage path', () => {
    const first = createRunContext('workflow-101-attempt-1');
    const second = createRunContext('workflow-102-attempt-1');

    expect(first).toMatchObject({
      runId: 'workflow-101-attempt-1',
      fixtureNamespace: 'E2E workflow-101-attempt-1',
    });
    expect(first.ownedName('Seed Habit 1')).toBe(
      'E2E workflow-101-attempt-1 - Seed Habit 1',
    );
    expect(first.identityEmail('browser-tests@example.test')).toBe(
      'browser-tests+workflow-101-attempt-1@example.test',
    );
    expect(first.fixtureNamespace).not.toBe(second.fixtureNamespace);
    expect(first.storageStatePath).not.toBe(second.storageStatePath);
    expect(first.registryPath).not.toBe(second.registryPath);
  });

  it('keeps distinct raw identities distinct after normalization and truncation', () => {
    const slash = createRunContext('run/a');
    const dash = createRunContext('run-a');
    const longPrefix = 'x'.repeat(70);
    const firstLong = createRunContext(`${longPrefix}-a`);
    const secondLong = createRunContext(`${longPrefix}-b`);

    expect(slash.runId).not.toBe(dash.runId);
    expect(firstLong.runId).not.toBe(secondLong.runId);
    expect(firstLong.runId).toHaveLength(64);
    expect(secondLong.runId).toHaveLength(64);
  });

  it('registers and reads only exact run-owned record IDs', () => {
    const registryPath = temporaryDirectory();
    const firstHabitId = '11111111-1111-4111-8111-111111111111';
    const secondHabitId = '22222222-2222-4222-8222-222222222222';
    const taskId = '33333333-3333-4333-8333-333333333333';

    registerFixtureId(registryPath, 'habits', firstHabitId);
    registerFixtureId(registryPath, 'habits', secondHabitId);
    registerFixtureId(registryPath, 'tasks', taskId);

    expect(readRegisteredFixtureIds(registryPath, 'habits')).toEqual([
      firstHabitId,
      secondHabitId,
    ]);
    expect(readRegisteredFixtureIds(registryPath, 'tasks')).toEqual([taskId]);
  });

  it('attempts every exact cleanup and reports all failures', async () => {
    const registryPath = temporaryDirectory();
    const firstHabitId = '11111111-1111-4111-8111-111111111111';
    const secondHabitId = '22222222-2222-4222-8222-222222222222';
    const taskId = '33333333-3333-4333-8333-333333333333';
    const attempts: string[] = [];

    registerFixtureId(registryPath, 'habits', firstHabitId);
    registerFixtureId(registryPath, 'habits', secondHabitId);
    registerFixtureId(registryPath, 'tasks', taskId);

    await expect(
      cleanupRegisteredFixtures(registryPath, {
        habits: async (id) => {
          attempts.push(`habit:${id}`);
          if (id === firstHabitId) throw new Error('habit cleanup unavailable');
        },
        tasks: async (id) => {
          attempts.push(`task:${id}`);
          throw new Error('task cleanup unavailable');
        },
      }),
    ).rejects.toThrow(
      /2 fixture cleanup operations failed[\s\S]*habit cleanup unavailable[\s\S]*task cleanup unavailable/,
    );

    expect(attempts).toEqual([
      `habit:${firstHabitId}`,
      `habit:${secondHabitId}`,
      `task:${taskId}`,
    ]);
  });
});
