import fs from 'node:fs';

const USER_VISIBLE = '- [x] User-visible product delivery';
const INTERNAL = '- [x] Internal, operational, or infrastructure-only change';
const TABLE_HEADER = '| Approved user-visible capability | Changed file(s) | Runnable verification |';

function fail(message) {
  throw new Error(`Release capability map: ${message}`);
}

function section(body, heading) {
  const marker = `## ${heading}`;
  const start = body.indexOf(marker);
  if (start < 0) return '';
  const contentStart = body.indexOf('\n', start) + 1;
  const nextHeading = body.indexOf('\n## ', contentStart);
  return body.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim();
}

function tableRows(map) {
  const lines = map.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === TABLE_HEADER);
  if (headerIndex < 0 || !/^\|\s*:?-+/.test(lines[headerIndex + 1] ?? '')) {
    fail('must contain the required three-column table.');
  }

  return lines
    .slice(headerIndex + 2)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell && !cell.startsWith('<!--')));
}

export function validateReleaseScope(body, changedFiles) {
  const classification = section(body, 'Delivery classification');
  const isUserVisible = classification.includes(USER_VISIBLE);
  const isInternal = classification.includes(INTERNAL);
  if (isUserVisible === isInternal) {
    fail('choose exactly one delivery classification.');
  }

  if (isInternal) return;

  const scopeSource = section(body, 'Product scope source');
  if (!/https?:\/\/\S+/.test(scopeSource)) {
    fail('a user-visible delivery needs a Product scope source URL.');
  }

  const rows = tableRows(section(body, 'Release capability map'));
  if (rows.length === 0) fail('a user-visible delivery needs at least one capability row.');

  for (const [capability, files, verification] of rows) {
    if (!capability || !files || !verification) {
      fail('each capability row needs a capability, changed file, and runnable verification.');
    }
    const paths = [...files.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (paths.length === 0) fail(`"${capability}" must list changed file paths in backticks.`);
    for (const path of paths) {
      if (!changedFiles.has(path)) fail(`"${path}" for "${capability}" is not changed by this PR.`);
    }
    if (!/(?:\bpnpm\b|\bnpm\b|\bnpx\b|\byarn\b|manual smoke:)/i.test(verification)) {
      fail(`"${capability}" needs a command or a "manual smoke:" procedure.`);
    }
  }
}

function main() {
  const [bodyPath, filesPath] = process.argv.slice(2);
  if (!bodyPath || !filesPath) {
    console.error('Usage: node scripts/validate-release-scope.mjs <pr-body-file> <changed-files-file>');
    process.exit(2);
  }
  try {
    validateReleaseScope(fs.readFileSync(bodyPath, 'utf8'), new Set(fs.readFileSync(filesPath, 'utf8').split(/\r?\n/).filter(Boolean)));
    console.log('Release capability map is complete.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
