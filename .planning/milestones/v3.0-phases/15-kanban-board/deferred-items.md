# Phase 15: Deferred Items

## Pre-existing Build Issues

1. **Type error in `app/api/projects/route.ts:75`** - `ProjectInsert` missing `status` and `sort_order` fields in POST handler. Pre-existing, not caused by kanban work.

2. **Pre-existing test error in `tests/components/update-password-form.test.tsx`** - Unhandled `window is not defined` ReferenceError.
