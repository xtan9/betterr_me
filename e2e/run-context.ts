import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export type FixtureKind = 'habits' | 'tasks';

export interface E2ERunContext {
  runId: string;
  fixtureNamespace: string;
  storageStatePath: string;
  registryPath: string;
  ownedName(label: string): string;
  identityEmail(baseEmail: string): string;
}

const UNSAFE_RUN_ID_CHARACTERS = /[^a-zA-Z0-9_-]+/g;

export function createRunContext(rawRunId: string): E2ERunContext {
  const normalizedRunId = rawRunId
    .replace(UNSAFE_RUN_ID_CHARACTERS, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalizedRunId) {
    throw new Error('E2E run identity must contain at least one letter or number');
  }
  const requiresCanonicalization = normalizedRunId !== rawRunId || normalizedRunId.length > 64;
  const digest = createHash('sha256').update(rawRunId).digest('hex').slice(0, 12);
  const runId = requiresCanonicalization
    ? `${normalizedRunId.slice(0, 51)}-${digest}`
    : normalizedRunId;

  const runDirectory = path.join('e2e', '.auth', runId);
  const fixtureNamespace = `E2E ${runId}`;

  return {
    runId,
    fixtureNamespace,
    storageStatePath: path.join(runDirectory, 'user.json'),
    registryPath: path.join(runDirectory, 'fixtures'),
    ownedName: (label) => `${fixtureNamespace} - ${label}`,
    identityEmail: (baseEmail) => {
      const separator = baseEmail.lastIndexOf('@');
      if (separator <= 0 || separator === baseEmail.length - 1) {
        throw new Error(`E2E identity email is invalid: ${baseEmail}`);
      }
      const localPart = baseEmail.slice(0, separator).split('+')[0];
      const domain = baseEmail.slice(separator + 1);
      const lowercaseRunId = runId.toLowerCase();
      const identityToken = lowercaseRunId.length <= 42
        ? lowercaseRunId
        : `${lowercaseRunId.slice(0, 29)}-${createHash('sha256').update(runId).digest('hex').slice(0, 12)}`;
      const baseLocalPart = localPart.slice(0, 63 - identityToken.length);
      return `${baseLocalPart}+${identityToken}@${domain}`;
    },
  };
}

export function requiredE2EEnvironment(name: string, phase: 'setup' | 'teardown') {
  const value = process.env[name];
  if (!value) throw new Error(`[${phase}] Missing required environment variable: ${name}`);
  return value;
}

export function registerFixtureId(registryPath: string, kind: FixtureKind, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new Error(`Cannot register invalid ${kind} fixture ID: ${id}`);
  }

  const kindPath = path.join(registryPath, kind);
  mkdirSync(kindPath, { recursive: true });
  writeFileSync(path.join(kindPath, id), `${id}\n`, { flag: 'wx' });
}

export function readRegisteredFixtureIds(registryPath: string, kind: FixtureKind): string[] {
  try {
    return readdirSync(path.join(registryPath, kind), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

type FixtureDeleters = Record<FixtureKind, (id: string) => Promise<void>>;

export async function cleanupRegisteredFixtures(
  registryPath: string,
  deleters: FixtureDeleters,
) {
  const failures: Error[] = [];

  for (const kind of ['habits', 'tasks'] as const) {
    for (const id of readRegisteredFixtureIds(registryPath, kind)) {
      try {
        await deleters[kind](id);
      } catch (error) {
        failures.push(
          new Error(`${kind}/${id}: ${error instanceof Error ? error.message : String(error)}`),
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} fixture cleanup operations failed:\n${failures.map((error) => error.message).join('\n')}`,
    );
  }
}
