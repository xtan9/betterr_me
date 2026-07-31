import type { NoViolationsMatcherResult } from 'vitest-axe/matchers';

declare module 'vitest' {
  interface Assertion<_T = unknown> {
    toHaveNoViolations(): NoViolationsMatcherResult;
  }

  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): NoViolationsMatcherResult;
  }
}
