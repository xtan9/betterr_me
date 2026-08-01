import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function repositoryFile(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

const glossaryEntries = [
  ["Recurring Task Series", ["Recurring task", "template"]],
  ["Series Revision", ["Template", "version"]],
  ["Series Defaults", ["Template fields"]],
  ["Recurrence Anchor", ["Start date"]],
  ["Recurrence Rule", ["Recurrence JSON", "schedule config"]],
  ["Activation Date", ["Start date"]],
  ["Task Occurrence", ["Instance", "generated task"]],
  ["Scheduled Date", ["Original date"]],
  ["Skipped Occurrence", ["Deleted instance"]],
  ["Withdrawn Occurrence", ["Skipped occurrence", "deleted instance"]],
  ["Open Occurrence", ["Future instance"]],
  ["Occurrence Override", ["Exception flag"]],
  ["Extra Occurrence", ["Orphaned instance"]],
  ["Occurrence Limit", ["End count", "instances generated"]],
  ["Last Scheduled Date", ["End date"]],
  ["Coverage Horizon", ["Generation window", "through date"]],
  ["Active Series", ["Enabled recurring task"]],
  ["Paused Series", ["Disabled recurring task"]],
  ["Ended Series", ["Deleted series", "archived template"]],
] as const;

const adrContracts = [
  [
    "docs/adr/0001-materialize-recurring-task-occurrences.md",
    "# Materialize recurring task occurrences",
    "Task Occurrences are persisted before callers read them",
    ["## Considered Options", "## Consequences"],
  ],
  [
    "docs/adr/0002-use-effective-dated-series-revisions.md",
    "# Use effective-dated recurring task series revisions",
    "A Recurring Task Series keeps one user-visible identity",
    ["## Considered Options", "## Consequences"],
  ],
  [
    "docs/adr/0003-retain-ended-recurring-task-series.md",
    "# Retain ended recurring task series",
    "The ordinary user-facing destructive action ends a Recurring Task Series",
    ["## Considered Options", "## Consequences"],
  ],
  [
    "docs/adr/0004-make-recurring-series-mutations-atomic.md",
    "# Make recurring task series mutations atomic",
    "every command that changes a Series, its revisions, and its Task Occurrences commits atomically",
    ["## Considered Options", "## Consequences"],
  ],
  [
    "docs/adr/0005-route-recurring-task-behavior-through-one-lifecycle.md",
    "# Route recurring task behavior through one lifecycle",
    "One recurring-task package owns the boundary",
    ["## Considered Options", "## Consequences"],
  ],
  [
    "docs/adr/0006-preserve-legacy-recurring-task-facts.md",
    "# Preserve legacy recurring task facts during migration",
    "Migration treats existing task rows as authoritative",
    ["## Consequences"],
  ],
  [
    "docs/adr/0007-store-recurring-occurrence-lineage-separately.md",
    "# Store recurring occurrence lineage separately from tasks",
    "A recurring-occurrence ledger keyed by Recurring Task Series and Scheduled Date",
    ["## Considered Options", "## Consequences"],
  ],
] as const;

function glossaryEntry(markdown: string, term: string): string {
  const start = markdown.indexOf(`**${term}**:`);
  const end = markdown.indexOf("\n\n**", start + term.length + 4);
  return markdown.slice(start, end < 0 ? markdown.length : end);
}

describe("recurring task lifecycle documentation contracts", () => {
  it("defines target vocabulary and the legacy terms to avoid", () => {
    const context = repositoryFile("CONTEXT.md");

    for (const [term, avoidedTerms] of glossaryEntries) {
      const entry = glossaryEntry(context, term);
      expect(entry).toContain(`**${term}**:`);
      const avoidLine = entry.match(/^_Avoid_:\s*(.+)$/m)?.[1];
      for (const avoidedTerm of avoidedTerms) {
        expect(avoidLine).toContain(avoidedTerm);
      }
    }
  });

  it("publishes each accepted recurring task lifecycle ADR", () => {
    for (const [path, title, decision, requiredSections] of adrContracts) {
      const adr = repositoryFile(path);

      expect(adr).toContain(title);
      expect(adr).toContain(decision);
      for (const section of requiredSections) {
        expect(adr).toContain(section);
      }
    }
  });
});
