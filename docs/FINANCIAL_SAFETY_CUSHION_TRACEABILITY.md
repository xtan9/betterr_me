# Financial Safety Cushion V1 Traceability

Status: active corrective-delivery baseline
Source: [Approved V1 PRD](https://app.notion.com/p/3a82db745b2981f68db4e3300eecf5c2)
Release rule: every row must have an implemented file and runnable test before review.

| Approved capability | Planned implementation | Required runnable evidence |
| --- | --- | --- |
| Money card below hero and before bills; entry from empty state | `components/money/financial-safety-cushion-card.tsx`, `components/money/money-dashboard.tsx`, `components/money/accounts-empty-state.tsx` | component tests and authenticated browser path |
| Save-as-you-go, resumable four-step manual flow | `app/money/safety-cushion/page.tsx`, `components/money/financial-safety-checkup.tsx`, `app/api/money/financial-safety-checkups/*` | API integration and browser resume tests |
| Available resources and explicit essential/reducible interruption costs | check-up component and `lib/db/financial-safety-checkups.ts` | manual-only browser test |
| Income scenarios, household gating, and confirmed transition income | check-up component, `lib/money/financial-safety-cushion.ts`, check-up API | calculation fixtures and household tests |
| Explainable result, curve, confidence, and Review/update | `components/money/financial-safety-result.tsx`, simulation library | deterministic calculation and accessibility tests |
| Completed-state card and latest-input date | card component and check-up API | component and browser tests |
| Immutable first touch, return touches, and exactly-once funnel events | `lib/db/financial-safety-checkups.ts`, API routes | API/RLS and event contract tests |
| 30-completion evidence rule | reporting query/helper under `lib/money/` | reporting query test |
| No score, benchmark, Plaid dependency, advice, or eligibility inference | copy review of all new product files | independent QA scope review |

## Existing safe foundation

`supabase/migrations/20260726000001_financial_safety_cushion_contract.sql` is deployed on production and remains the persistence/RLS contract. `lib/money/financial-safety-cushion.ts` supplies the bounded 12-month, explainable simulation. No destructive schema change is planned without a separate data-safety review.

## Remaining-capability execution plan

| Milestone | Directly responsible owner | Exact completion checkpoint |
| --- | --- | --- |
| Draft entry and save/resume | Theo Browne | Complete: rebased slice plus focused test evidence by 2026-07-25 18:00 PDT. |
| Four-step guided flow and household-aware scenarios | Matt Loftus | 2026-07-27 18:00 PDT: all four steps runnable locally, including manual-only, resume, partner gating, and save-as-you-go tests. |
| Result, curve, confidence, saved completed state, and Review/update | Gaurav Jawla | 2026-07-28 18:00 PDT: deterministic result fixtures and accessible rendered result attached to PR #468. |
| Persistence, attribution, first/return touch, funnel, and 30-completion reporting | Bailey Johnson and Tingying Ding | 2026-07-29 18:00 PDT: API/RLS/event contract and reporting-query evidence attached to PR #468. |
| Full traceability, independent QA, exact-SHA authenticated Preview | Jeffery Zhang and Elsa | 2026-07-30 18:00 PDT: every table row implemented and tested; preview journey and gate evidence recorded. |
| Controlled production promotion and synthetic-data smoke | Theo Browne | Production candidate: 2026-07-31, after independent approval, exact-head gates, and the required deployed-SHA/login/card/check-up/saved-result/isolation smoke all pass. |

The July 31 date is a production target, not a launch claim. Any missed evidence checkpoint moves the date; no partial capability is eligible for approval.
