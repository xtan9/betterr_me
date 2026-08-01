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

describe("Reminder Defaults mutation architecture boundaries", () => {
  it("routes HTTP default writes through ReminderDefaultWrites", () => {
    const route = source("app/api/reminder-defaults/route.ts");
    const put = section(route, "export async function PUT", "  } catch");

    expect(put).toContain("createReminderDefaultWrites(supabase).upsert");
    expect(put).not.toMatch(/new ReminderDefaultsDB|\.upsertDefault\(/);
    expect(route).toContain("new ReminderDefaultsDB(supabase)");
  });

  it("keeps the default request and persistence port storage-independent", () => {
    const writes = source("lib/reminders/default-writes.ts");
    const requestStart = writes.indexOf("export interface ReminderDefaultValues");
    const persistenceStart = writes.indexOf("export interface ReminderDefaultWritesPersistence");
    const request = writes.slice(requestStart, persistenceStart);

    expect(request).toContain("sourceType");
    expect(request).toContain("relativeMinutes");
    expect(request).not.toContain("ReminderDefaultInsert");
    expect(request).not.toContain("source_type");
    expect(request).not.toContain("relative_minutes");
    expect(writes).toContain("source_type: value.sourceType");
  });
});
