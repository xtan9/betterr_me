import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find architecture section ${start}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("Journal save mutation architecture boundaries", () => {
  it("routes date saves through JournalWrites without an upsert bypass", () => {
    const route = source("app/api/journal/route.ts");
    const post = section(route, "export async function POST", "\n}");

    expect(post).toContain("createJournalWrites(supabase).save");
    expect(post).not.toMatch(/journalDB\.upsertEntry/);
  });

  it("routes explicit entry updates through JournalWrites without an update bypass", () => {
    const route = source("app/api/journal/[id]/route.ts");
    const patch = section(route, "export async function PATCH", "\n}");

    expect(patch).toContain("createJournalWrites(supabase).save");
    expect(patch).not.toMatch(/journalDB\.updateEntry/);
  });

  it("routes AI plain-text saves through the same JournalWrites boundary", () => {
    const tools = source("lib/ai/tools/journal.ts");
    const create = section(tools, 'name: "createJournalEntry"', 'name: "deleteJournalEntry"');

    expect(create).toContain("createJournalWrites(ctx.supabase).save");
    expect(create).not.toMatch(/\.upsertEntry\(/);
  });

  it("keeps journal saves out of the generic database write inventory", () => {
    const journalDb = source("lib/db/journal-entries.ts");

    expect(journalDb).not.toMatch(/async upsertEntry\s*\(/);
    expect(journalDb).not.toMatch(/async updateEntry\s*\(/);
  });
});
