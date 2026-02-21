# Phase 17: Fix Project Archive/Restore Validation - Research

**Researched:** 2026-02-20
**Domain:** Zod validation schema extension for project status field
**Confidence:** HIGH

## Summary

Phase 17 fixes a single, well-understood bug: the `projectUpdateSchema` in `lib/validations/project.ts` does not include the `status` field, so PATCH requests to archive or restore projects are rejected with HTTP 400. The root cause was identified during the v3.0 milestone audit (post-Phase 16).

The fix is a one-line `.extend()` call on the existing Zod schema. The DB layer (`ProjectsDB.updateProject()` and `ProjectsDB.archiveProject()`), the TypeScript types (`ProjectUpdate` includes `status`), the database schema (CHECK constraint accepts 'active' and 'archived'), and all UI components (`handleArchiveProject` in tasks-page-content, `handleRestore` in archived-projects-content) are already correct. Only the Zod validation gateway is blocking the flow.

**Primary recommendation:** Extend `projectUpdateSchema` with `.extend({ status: z.enum(['active', 'archived']).optional() })` before the `.refine()` call, add a validation test file for project schemas, and add archive/restore test cases to the PATCH API route test file.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-03 | User can archive a project (hidden by default, available via filter) | Schema fix unblocks the existing archive/restore UI flows; DB layer, types, UI, and database all already support the operation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | (project dependency) | Schema validation at API boundaries | Already used for all validation in this project |

### Supporting
No new libraries needed. This is purely a schema extension within the existing validation layer.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `.extend()` on partial schema | Rebuild schema from scratch | `.extend()` is minimal change, preserves existing form schema relationship |
| Zod enum for status | Zod literal union | Enum is cleaner and matches the pattern used for `projectSectionSchema` and `taskStatusSchema` in the codebase |

## Architecture Patterns

### Pattern 1: Schema Extension with `.extend()`
**What:** Use Zod's `.extend()` method to add fields to a schema derived from `.partial()`
**When to use:** When the update schema needs fields not in the create/form schema (e.g., status changes that aren't part of the creation form)
**Example:**
```typescript
// lib/validations/project.ts — CURRENT (broken)
export const projectUpdateSchema = projectFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// FIXED
export const projectStatusSchema = z.enum(['active', 'archived']);

export const projectUpdateSchema = projectFormSchema
  .partial()
  .extend({ status: projectStatusSchema.optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

**Why this works:** Zod's `.partial()` returns a `ZodObject`, and `.extend()` adds new properties to it. The `.refine()` must come AFTER `.extend()` because `.refine()` wraps the schema in a `ZodEffects` which doesn't support `.extend()`.

### Pattern 2: Existing Precedent — taskUpdateSchema
**What:** The task validation already follows this exact pattern
**Where:** `lib/validations/task.ts` lines 25-37
```typescript
export const taskUpdateSchema = taskFormSchema
  .partial()
  .extend({
    is_completed: z.boolean().optional(),
    completed_at: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    section: z.enum(['personal', 'work']).optional(),
    sort_order: z.number().optional(),
    project_id: z.string().uuid().nullable().optional(),
  })
  .refine(...)
```
The project fix mirrors this established pattern exactly.

### Anti-Patterns to Avoid
- **Adding status to projectFormSchema:** Status is NOT a user-editable form field during create/edit. It should only be in the update schema. The form schema drives the create-project and edit-project modals which have name/section/color fields only.
- **Using `.passthrough()` instead of `.extend()`:** Passthrough would allow ANY unknown field through validation, defeating the purpose of schema validation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status enum validation | Manual string checks | `z.enum(['active', 'archived'])` | Type-safe, generates TypeScript types, consistent with codebase |

**Key insight:** The entire fix is one line of Zod code. The effort is primarily in test coverage, not implementation.

## Common Pitfalls

### Pitfall 1: Ordering `.extend()` after `.refine()`
**What goes wrong:** `.refine()` returns a `ZodEffects` wrapper, not a `ZodObject`. Calling `.extend()` on `ZodEffects` fails at compile time.
**Why it happens:** Developer adds `.extend()` at the end of the chain
**How to avoid:** Chain order must be: `.partial()` -> `.extend()` -> `.refine()`
**Warning signs:** TypeScript error "Property 'extend' does not exist on type 'ZodEffects'"

### Pitfall 2: Forgetting to export the status schema
**What goes wrong:** If a `projectStatusSchema` is created for reuse but not exported, future consumers can't reference it
**Why it happens:** Schema is only used in one place so export seems unnecessary
**How to avoid:** Export it — the DB types already define `ProjectStatus = 'active' | 'archived'` and having a matching Zod schema enables future validation reuse

### Pitfall 3: Not testing the empty-body refine still works
**What goes wrong:** The `.refine()` guard that rejects empty updates could be broken by the schema change
**Why it happens:** Focus on testing the new `status` field, forget to verify existing guard
**How to avoid:** Include a test case for `projectUpdateSchema.safeParse({})` returning failure

### Pitfall 4: Not testing that invalid status values are rejected
**What goes wrong:** Only testing happy path; missing that `{status: "deleted"}` should fail
**Why it happens:** Focus on making archive/restore work, not on guarding against invalid values
**How to avoid:** Include negative test for invalid status values

## Code Examples

Verified patterns from the existing codebase:

### The Exact Fix
```typescript
// lib/validations/project.ts
import { z } from "zod";

export const projectSectionSchema = z.enum(['personal', 'work']);
export const projectStatusSchema = z.enum(['active', 'archived']);

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less"),
  section: projectSectionSchema,
  color: z.string().min(1, "Color is required"),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const projectUpdateSchema = projectFormSchema
  .partial()
  .extend({ status: projectStatusSchema.optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ProjectUpdateValues = z.infer<typeof projectUpdateSchema>;
```

### Validation Test Pattern (from tests/lib/validations/task.test.ts)
```typescript
import { describe, it, expect } from 'vitest';
import { projectFormSchema, projectUpdateSchema } from '@/lib/validations/project';

describe('projectUpdateSchema', () => {
  it('accepts status: archived', () => {
    const result = projectUpdateSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(true);
  });

  it('accepts status: active', () => {
    const result = projectUpdateSchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = projectUpdateSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = projectUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

### API Route Test Pattern (from tests/app/api/projects/[id]/route.test.ts)
```typescript
it('should archive a project', async () => {
  const archivedProject = { ...mockProject, status: 'archived' };
  vi.mocked(mockProjectsDB.updateProject).mockResolvedValue(archivedProject);

  const request = new NextRequest('http://localhost:3000/api/projects/p1', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'archived' }),
  });

  const response = await PATCH(request, {
    params: Promise.resolve({ id: 'p1' }),
  });
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.project.status).toBe('archived');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — this is a bug fix | `.extend()` to add status to update schema | Phase 17 | Unblocks PROJ-03 |

**No deprecated patterns apply.** This is a straightforward Zod schema extension.

## Open Questions

None. The problem is fully diagnosed, the fix is known, and all adjacent code (DB layer, types, UI, SQL) already supports the operation. There are no architectural decisions to make.

## Sources

### Primary (HIGH confidence)
- `lib/validations/project.ts` — Current broken schema (lines 17-21)
- `lib/validations/task.ts` — Working precedent using `.extend()` pattern (lines 25-37)
- `lib/db/types.ts` — `ProjectStatus = 'active' | 'archived'` and `ProjectUpdate` type (lines 85-105)
- `lib/db/projects.ts` — `archiveProject()` method already works at DB level (lines 90-92)
- `app/api/projects/[id]/route.ts` — PATCH handler using `projectUpdateSchema` (line 66)
- `supabase/migrations/20260219000001_create_projects_table.sql` — DB CHECK constraint (line 10)
- `.planning/v3.0-MILESTONE-AUDIT.md` — Root cause analysis and proposed fix (lines 110-131)
- `components/tasks/tasks-page-content.tsx` — Archive UI handler sending `{status:'archived'}` (lines 159-174)
- `components/projects/archived-projects-content.tsx` — Restore UI handler sending `{status:'active'}` (lines 20-34)

### Secondary (MEDIUM confidence)
- None needed — all sources are primary (codebase inspection)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries, pure Zod schema fix within existing patterns
- Architecture: HIGH — Exact same `.extend()` pattern already used in `taskUpdateSchema`
- Pitfalls: HIGH — Problem fully diagnosed in milestone audit with exact fix specified

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable — no external dependencies involved)
