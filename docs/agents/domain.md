# Domain Docs

How the engineering skills should consume this repository's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- `docs/adr/` entries relevant to the area being changed.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

This is a single-context repository:

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
`-- src/
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether the language belongs to the project or note the genuine gap for the `domain-modeling` skill.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.
