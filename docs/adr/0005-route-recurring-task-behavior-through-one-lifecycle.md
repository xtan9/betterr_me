# Route recurring task behavior through one lifecycle

One recurring-task package owns the boundary. Its behavior-rich lifecycle command interface owns Series creation, revisions, coverage, pause/resume, ending, and every lifecycle-relevant mutation of a Task Occurrence; focused query interfaces serve read projections. HTTP and AI callers use shared command modules, and task commands detect Series membership and delegate recurring edits, completion transitions, and skips to the lifecycle instead of exposing database modules or storage-shaped rules.

## Considered Options

- Let each HTTP route, AI tool, and dashboard combine recurring-task database operations directly.
- Put only generation behind a recurring module while task mutations remain generic table writes.
- Route Series commands and all lifecycle-relevant occurrence mutations through one lifecycle.

## Consequences

Reads may continue to use focused query modules after coverage is ensured. Sort-only presentation changes can remain ordinary task writes, but no caller may bypass the lifecycle for a change that affects scheduling, overrides, completion history, or Series state. Completion uses explicit idempotent complete/reopen intent rather than a retry-unsafe toggle. Every channel maps into the same canonical recurrence command and validation rules; type casts are not a substitute for domain validation. The lifecycle returns typed domain outcomes and failures, which channel adapters translate without inspecting error-message text.
