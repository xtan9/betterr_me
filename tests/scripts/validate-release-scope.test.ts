import { describe, expect, it } from 'vitest';
import { validateReleaseScope } from '@/scripts/validate-release-scope.mjs';

const changedFiles = new Set(['components/financial-safety-card.tsx', 'e2e/financial-safety.spec.ts']);
const validProductBody = `## Delivery classification

- [x] User-visible product delivery
- [ ] Internal, operational, or infrastructure-only change

## Product scope source

https://example.com/prd

## Release capability map

| Approved user-visible capability | Changed file(s) | Runnable verification |
| --- | --- | --- |
| Dashboard card | \`components/financial-safety-card.tsx\` | \`pnpm test:e2e:chromium -- e2e/financial-safety.spec.ts\` |

## Reviewer release-scope check

- [x] I reconciled every approved user-visible capability in the scope source to a row above.`;

describe('validateReleaseScope', () => {
  it('accepts a complete user-visible capability map', () => {
    expect(() => validateReleaseScope(validProductBody, changedFiles)).not.toThrow();
  });

  it('rejects a user-visible delivery without a product scope URL', () => {
    expect(() => validateReleaseScope(validProductBody.replace('https://example.com/prd', ''), changedFiles))
      .toThrow('Product scope source URL');
  });

  it('rejects a capability mapped to a file outside the PR', () => {
    expect(() => validateReleaseScope(validProductBody.replace('components/financial-safety-card.tsx', 'app/missing/page.tsx'), changedFiles))
      .toThrow('not changed by this PR');
  });

  it('permits an explicitly internal change without a capability map', () => {
    const body = `## Delivery classification

- [ ] User-visible product delivery
- [x] Internal, operational, or infrastructure-only change`;
    expect(() => validateReleaseScope(body, new Set())).not.toThrow();
  });
});
