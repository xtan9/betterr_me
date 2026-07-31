import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    'e2e/project-organization.spec.ts',
    '--project=chromium',
    ...process.argv.slice(2),
  ],
  {
    env: { ...process.env, E2E_DATA_MODE: 'disposable' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
