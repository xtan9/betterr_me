## Delivery classification

<!-- Choose exactly one. A user-visible product delivery cannot be merged until
the capability map below is complete and a reviewer reconciles it to the
linked product scope. -->

- [ ] User-visible product delivery
- [ ] Internal, operational, or infrastructure-only change

## Product scope source

<!-- Required for user-visible product deliveries. Link the approved PRD,
issue, or decision that enumerates the user-visible capabilities. -->

<!-- https://... -->

## Release capability map

<!-- Required for user-visible product deliveries. Add one row for *every*
approved user-visible capability; concrete file paths must be changed by this
PR. The verification column must contain a command that can be run, or a
precise manual release-gate procedure. -->

| Approved user-visible capability | Changed file(s) | Runnable verification |
| --- | --- | --- |
| <!-- capability from the source above --> | `path/to/file.tsx` | `pnpm test:run -- path/to/test.ts` |

## Reviewer release-scope check

- [ ] I reconciled every approved user-visible capability in the scope source to a row above.
- [ ] Each mapped file is part of this PR, and each verification is runnable against this delivery.
