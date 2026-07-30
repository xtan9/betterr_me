import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RecurringTask } from "@/lib/db/types";

// Mock the logger so we can assert on error paths without console noise.
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { log } from "@/lib/logger";
import { ensureRecurringInstances } from "@/lib/recurring-tasks/instance-generator";

// =============================================================================
// Call-recording Supabase mock
// =============================================================================
//
// We reproduce the Supabase thenable-chain builder but also record the full
// chain of method calls in order. Each awaited terminal yields a
// pre-configured `{ data, error }` response from a queue.
//
// Query shape tracked: { table, method, args } tuples. This mirrors
// `mockSupabaseClient.queryLog` in tests/setup.ts but is scoped per-test
// to keep this file isolated from other suites.
interface QueryLogEntry {
  table: string | null;
  method: string;
  args: unknown[];
}

interface QueuedResponse {
  data: unknown;
  error: unknown;
}

function createRecordingSupabase(responses: QueuedResponse[]) {
  const queryLog: QueryLogEntry[] = [];
  let currentTable: string | null = null;

  const record = (method: string, args: unknown[]) => {
    queryLog.push({ table: currentTable, method, args });
  };

  const chain: Record<string, unknown> = {};

  const chainable = (name: string) =>
    (...args: unknown[]) => {
      record(name, args);
      return chain;
    };

  chain.select = chainable("select");
  chain.insert = chainable("insert");
  chain.update = chainable("update");
  chain.delete = chainable("delete");
  chain.eq = chainable("eq");
  chain.in = chainable("in");
  chain.lte = chainable("lte");
  chain.gte = chainable("gte");
  chain.order = chainable("order");
  chain.limit = chainable("limit");

  chain.single = () => {
    record("single", []);
    const next = responses.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  };

  // Thenable: each await pulls the next queued response
  (chain as { then: unknown }).then = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    const next = responses.shift() ?? { data: null, error: null };
    return Promise.resolve(next).then(onFulfilled, onRejected);
  };

  const supabase = {
    from: (table: string) => {
      currentTable = table;
      record("from", [table]);
      return chain;
    },
  };

  return { supabase, queryLog };
}

/** Find a query-log entry matching the given partial shape. */
function findQuery(
  log: QueryLogEntry[],
  match: Partial<QueryLogEntry>,
): QueryLogEntry | undefined {
  return log.find(
    (entry) =>
      (match.table === undefined || entry.table === match.table) &&
      (match.method === undefined || entry.method === match.method) &&
      (match.args === undefined ||
        JSON.stringify(entry.args) === JSON.stringify(match.args)),
  );
}

/** Assert at least one matching call exists — throws if not. */
function expectQuery(log: QueryLogEntry[], match: Partial<QueryLogEntry>) {
  const found = findQuery(log, match);
  if (!found) {
    throw new Error(
      `expectQuery: no matching call.\nWanted: ${JSON.stringify(match)}\nGot: ${JSON.stringify(log, null, 2)}`,
    );
  }
  return found;
}

// =============================================================================
// Fixtures
// =============================================================================
const USER_ID = "user-1";

function makeTemplate(over: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: "tmpl-1",
    user_id: USER_ID,
    title: "Daily standup",
    description: null,
    priority: 1,
    category_id: null,
    due_date: null,
    due_time: "09:00:00",
    recurrence_rule: { frequency: "daily", interval: 1 },
    start_date: "2026-02-17",
    end_type: "never",
    end_date: null,
    end_count: null,
    instances_generated: 0,
    next_generate_date: "2026-02-17",
    status: "active",
    created_at: "2026-02-17T00:00:00Z",
    updated_at: "2026-02-17T00:00:00Z",
    ...over,
  } as RecurringTask;
}

// =============================================================================
// Tests
// =============================================================================
describe("ensureRecurringInstances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────
  // Initial template-fetch query
  // ───────────────────────────────────────────────────────────────────
  describe("template-fetch query", () => {
    it("selects active templates for the user, filtered by next_generate_date", async () => {
      const { supabase, queryLog } = createRecordingSupabase([
        { data: [], error: null }, // empty template list
      ]);

      const result = await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      expect(result).toEqual({
        status: "complete",
        failedTemplateIds: [],
      });

      // Full chain sanity — catches .from / .select / .eq / .lte arg mutations
      expectQuery(queryLog, { table: "recurring_tasks", method: "from", args: ["recurring_tasks"] });
      expectQuery(queryLog, { table: "recurring_tasks", method: "select", args: ["*"] });
      expectQuery(queryLog, { table: "recurring_tasks", method: "eq", args: ["user_id", USER_ID] });
      expectQuery(queryLog, { table: "recurring_tasks", method: "eq", args: ["status", "active"] });
      expectQuery(queryLog, { table: "recurring_tasks", method: "lte", args: ["next_generate_date", "2026-02-20"] });
    });

    it("returns early (no side effects) when no active templates exist", async () => {
      const { supabase, queryLog } = createRecordingSupabase([
        { data: [], error: null },
      ]);

      const result = await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      expect(result).toEqual({
        status: "complete",
        failedTemplateIds: [],
      });
      // No second from() — only the initial template fetch happened
      const fromCalls = queryLog.filter((q) => q.method === "from");
      expect(fromCalls).toHaveLength(1);
      expect(fromCalls[0].args).toEqual(["recurring_tasks"]);
    });

    it("returns early when the templates list is null (no error)", async () => {
      // Supabase may return null data with no error — covers the `!templates`
      // branch (vs `templates.length === 0`).
      const { supabase, queryLog } = createRecordingSupabase([
        { data: null, error: null },
      ]);

      const result = await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      expect(result).toEqual({
        status: "complete",
        failedTemplateIds: [],
      });
      const fromCalls = queryLog.filter((q) => q.method === "from");
      expect(fromCalls).toHaveLength(1);
    });

    it("throws when templates fetch returns an error (with message)", async () => {
      const { supabase } = createRecordingSupabase([
        { data: null, error: { message: "db exploded" } },
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).rejects.toThrow("ensureRecurringInstances: failed to fetch templates: db exploded");
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Generation — insert + update paths
  // ───────────────────────────────────────────────────────────────────
  describe("instance generation (daily, end_type=never)", () => {
    it("inserts missing instances with all expected fields, and advances next_generate_date", async () => {
      const template = makeTemplate({
        id: "tmpl-daily",
        title: "Standup",
        description: "sync",
        priority: 2,
        category_id: "cat-1",
        due_time: "09:00:00",
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-02-17",
        next_generate_date: "2026-02-17",
        instances_generated: 4,
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null }, // 1) template fetch
        { data: [], error: null }, // 2) existing-instances query (no dupes)
        { data: null, error: null }, // 3) insert
        { data: null, error: null }, // 4) template update
      ]);

      const result = await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      expect(result).toEqual({
        status: "complete",
        failedTemplateIds: [],
      });

      // Existing-instances query chain
      expectQuery(queryLog, { table: "tasks", method: "from", args: ["tasks"] });
      expectQuery(queryLog, { table: "tasks", method: "select", args: ["original_date"] });
      expectQuery(queryLog, { table: "tasks", method: "eq", args: ["recurring_task_id", "tmpl-daily"] });
      expectQuery(queryLog, {
        table: "tasks",
        method: "in",
        args: ["original_date", [
          "2026-02-17",
          "2026-02-18",
          "2026-02-19",
          "2026-02-20",
        ]],
      });

      // Insert chain — 4 daily occurrences, all with the full expected shape
      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const insertedRows = insertCall.args[0] as Array<Record<string, unknown>>;
      expect(insertedRows).toHaveLength(4);
      expect(insertedRows).toEqual([
        {
          user_id: USER_ID,
          title: "Standup",
          description: "sync",
          priority: 2,
          category_id: "cat-1",
          due_date: "2026-02-17",
          due_time: "09:00:00",
          is_completed: false,
          status: "todo",
          section: "personal",
          recurring_task_id: "tmpl-daily",
          is_exception: false,
          original_date: "2026-02-17",
        },
        {
          user_id: USER_ID,
          title: "Standup",
          description: "sync",
          priority: 2,
          category_id: "cat-1",
          due_date: "2026-02-18",
          due_time: "09:00:00",
          is_completed: false,
          status: "todo",
          section: "personal",
          recurring_task_id: "tmpl-daily",
          is_exception: false,
          original_date: "2026-02-18",
        },
        {
          user_id: USER_ID,
          title: "Standup",
          description: "sync",
          priority: 2,
          category_id: "cat-1",
          due_date: "2026-02-19",
          due_time: "09:00:00",
          is_completed: false,
          status: "todo",
          section: "personal",
          recurring_task_id: "tmpl-daily",
          is_exception: false,
          original_date: "2026-02-19",
        },
        {
          user_id: USER_ID,
          title: "Standup",
          description: "sync",
          priority: 2,
          category_id: "cat-1",
          due_date: "2026-02-20",
          due_time: "09:00:00",
          is_completed: false,
          status: "todo",
          section: "personal",
          recurring_task_id: "tmpl-daily",
          is_exception: false,
          original_date: "2026-02-20",
        },
      ]);

      // Template-update chain — next_generate_date = throughDate + 1; counter += 4
      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({
        next_generate_date: "2026-02-21",
        instances_generated: 8, // 4 prior + 4 new
      });
      expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "eq",
        args: ["id", "tmpl-daily"],
      });
    });

    it("filters out dates that already have instances (dedup via original_date)", async () => {
      const template = makeTemplate({ id: "tmpl-dedup" });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        // Existing: Feb 17 and Feb 19 — only Feb 18 and Feb 20 should be new
        {
          data: [
            { original_date: "2026-02-17" },
            { original_date: "2026-02-19" },
          ],
          error: null,
        },
        { data: null, error: null }, // insert
        { data: null, error: null }, // template update
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows.map((r) => r.original_date)).toEqual([
        "2026-02-18",
        "2026-02-20",
      ]);
      expect(rows).toHaveLength(2);
    });

    it("skips insert entirely when all occurrences already exist (no insert call)", async () => {
      const template = makeTemplate({ id: "tmpl-all-dup", instances_generated: 10 });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        {
          data: [
            { original_date: "2026-02-17" },
            { original_date: "2026-02-18" },
            { original_date: "2026-02-19" },
            { original_date: "2026-02-20" },
          ],
          error: null,
        },
        { data: null, error: null }, // template update (no insert happens)
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      // No insert call was made — validates `newInstances.length > 0` branch
      const insertCalls = queryLog.filter((q) => q.method === "insert");
      expect(insertCalls).toHaveLength(0);

      // Template advancement accounts for every occurrence in the pending
      // window, even though the corresponding rows already exist.
      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({
        next_generate_date: "2026-02-21",
        instances_generated: 14,
      });
    });

    it("defaults rangeStart to start_date when next_generate_date is null", async () => {
      const template = makeTemplate({
        id: "tmpl-null-ngd",
        start_date: "2026-02-19",
        next_generate_date: null as unknown as string,
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      // rangeStart = start_date = 2026-02-19 → occurrences 19, 20
      expect(rows.map((r) => r.original_date)).toEqual(["2026-02-19", "2026-02-20"]);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // end_type=on_date
  // ───────────────────────────────────────────────────────────────────
  describe("end_type='on_date'", () => {
    it("constrains rangeEnd to end_date when end_date < throughDate", async () => {
      const template = makeTemplate({
        id: "tmpl-end-early",
        end_type: "on_date",
        end_date: "2026-02-18", // ends before throughDate 2026-02-20
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      // Only Feb 17, 18 should be inserted
      expect(rows.map((r) => r.original_date)).toEqual([
        "2026-02-17",
        "2026-02-18",
      ]);
    });

    it("does NOT constrain when end_date > throughDate", async () => {
      const template = makeTemplate({
        id: "tmpl-end-future",
        end_type: "on_date",
        end_date: "2026-03-01", // after throughDate 2026-02-20
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      // rangeEnd should remain throughDate → 17, 18, 19, 20
      expect(rows.map((r) => r.original_date)).toEqual([
        "2026-02-17",
        "2026-02-18",
        "2026-02-19",
        "2026-02-20",
      ]);
    });

    it("does NOT constrain when end_date equals throughDate (boundary)", async () => {
      const template = makeTemplate({
        id: "tmpl-end-equal",
        end_type: "on_date",
        end_date: "2026-02-20", // equal — source uses strict `<`, so no change
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows.map((r) => r.original_date)).toEqual([
        "2026-02-17",
        "2026-02-18",
        "2026-02-19",
        "2026-02-20",
      ]);
    });

    it("ignores end_date when end_type is not 'on_date'", async () => {
      // `end_type === 'on_date' && end_date` — an end_date without the right
      // end_type must NOT constrain the range.
      const template = makeTemplate({
        id: "tmpl-wrong-end-type",
        end_type: "never",
        end_date: "2026-02-18", // would constrain if end_type matched, but it doesn't
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows).toHaveLength(4);
    });

    it("ignores end_date when end_date itself is null (falsy guard)", async () => {
      const template = makeTemplate({
        id: "tmpl-null-end-date",
        end_type: "on_date",
        end_date: null, // no actual date set
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows).toHaveLength(4);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // end_type=after_count
  // ───────────────────────────────────────────────────────────────────
  describe("end_type='after_count'", () => {
    it("slices occurrences to exactly `remaining` when remaining < occurrences", async () => {
      const template = makeTemplate({
        id: "tmpl-count-partial",
        end_type: "after_count",
        end_count: 5,
        instances_generated: 3, // remaining = 2
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      // throughDate spans Feb 17-20 (4 occurrences), but remaining=2 → only first 2
      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows.map((r) => r.original_date)).toEqual([
        "2026-02-17",
        "2026-02-18",
      ]);
      expect(rows).toHaveLength(2);

      // instances_generated increments by 2, not 4
      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({
        next_generate_date: "2026-02-21",
        instances_generated: 5, // 3 prior + 2 new
      });
    });

    it("returns all occurrences when remaining > occurrences count", async () => {
      const template = makeTemplate({
        id: "tmpl-count-plenty",
        end_type: "after_count",
        end_count: 100,
        instances_generated: 0, // remaining = 100 >> 4
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows).toHaveLength(4);
    });

    it("accounts for existing instances when retrying after template advancement fails", async () => {
      const template = makeTemplate({
        id: "tmpl-retry-count",
        end_type: "after_count",
        end_count: 2,
        instances_generated: 0,
        next_generate_date: "2026-02-17",
      });
      const existingInstances = [
        { original_date: "2026-02-17" },
        { original_date: "2026-02-18" },
      ];
      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: { message: "advancement failed" } },
        { data: [template], error: null },
        { data: existingInstances, error: null },
        { data: null, error: null },
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-retry-count"],
      });
      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "complete",
        failedTemplateIds: [],
      });

      const templateUpdates = queryLog.filter(
        (entry) =>
          entry.table === "recurring_tasks" && entry.method === "update",
      );
      expect(templateUpdates).toHaveLength(2);
      expect(templateUpdates[1].args[0]).toEqual({
        next_generate_date: "2026-02-21",
        instances_generated: 2,
      });
      expect(queryLog.filter((entry) => entry.method === "insert")).toHaveLength(
        1,
      );
    });

    it("archives the template (status='archived') when remaining <= 0 (exactly at limit)", async () => {
      const template = makeTemplate({
        id: "tmpl-at-limit",
        end_type: "after_count",
        end_count: 3,
        instances_generated: 3, // remaining = 0 → archive
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: null, error: null }, // archive update
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      // Archive update
      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({ status: "archived" });
      expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "eq",
        args: ["id", "tmpl-at-limit"],
      });

      // No insert happened → no second from('tasks')
      const insertCalls = queryLog.filter((q) => q.method === "insert");
      expect(insertCalls).toHaveLength(0);

      // No advance-next-gen update happened → only 1 update total
      const updateCalls = queryLog.filter((q) => q.method === "update");
      expect(updateCalls).toHaveLength(1);
    });

    it("archives when remaining < 0 (instances_generated exceeds limit)", async () => {
      const template = makeTemplate({
        id: "tmpl-over-limit",
        end_type: "after_count",
        end_count: 1,
        instances_generated: 5, // remaining = -4
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({ status: "archived" });
    });

    it("logs (not throws) when the archive update fails", async () => {
      const template = makeTemplate({
        id: "tmpl-archive-fail",
        end_type: "after_count",
        end_count: 1,
        instances_generated: 5,
      });

      const { supabase } = createRecordingSupabase([
        { data: [template], error: null },
        { data: null, error: { message: "update failed" } },
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-archive-fail"],
      });

      // Verify the archive-specific error log — kills mutations on the log message
      const calls = (log.error as ReturnType<typeof vi.fn>).mock.calls;
      const match = calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("Failed to archive template at count limit"),
      );
      expect(match).toBeDefined();
    });

    it("ignores end_count when end_type is not 'after_count'", async () => {
      const template = makeTemplate({
        id: "tmpl-wrong-count-type",
        end_type: "never",
        end_count: 1, // would archive if end_type matched
        instances_generated: 5,
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows).toHaveLength(4);

      // Ensure no archive happened (update went through updateTemplateAfterGeneration)
      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).not.toHaveProperty("status");
    });

    it("ignores end_count when end_count itself is null (falsy guard)", async () => {
      const template = makeTemplate({
        id: "tmpl-null-count",
        end_type: "after_count",
        end_count: null,
        instances_generated: 5,
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      // No archive; normal insert
      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ original_date: string }>;
      expect(rows).toHaveLength(4);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // No-occurrence path
  // ───────────────────────────────────────────────────────────────────
  describe("empty-occurrence window", () => {
    it("still advances next_generate_date even when no occurrences fall in the window", async () => {
      // Weekly Mondays only; rangeStart Feb 17 (Tue) through Feb 22 (Sun) contains no Monday.
      const template = makeTemplate({
        id: "tmpl-no-occ",
        recurrence_rule: {
          frequency: "weekly",
          interval: 1,
          days_of_week: [1], // Mondays
        },
        start_date: "2026-02-16", // Mon
        next_generate_date: "2026-02-17", // Tue
        instances_generated: 7,
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: null, error: null }, // template update (no insert)
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-22",
      );

      // Only one update call (the advance); no tasks table activity at all
      expect(queryLog.filter((q) => q.table === "tasks")).toHaveLength(0);

      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect(updateCall.args[0]).toEqual({
        next_generate_date: "2026-02-23", // throughDate + 1
        instances_generated: 7, // unchanged (newCount=0)
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // next_generate_date arithmetic (throughDate + 1)
  // ───────────────────────────────────────────────────────────────────
  describe("next_generate_date advancement arithmetic", () => {
    it("advances across month boundary (Feb 28 → Mar 1)", async () => {
      const template = makeTemplate({
        id: "tmpl-feb-end",
        start_date: "2026-02-28",
        next_generate_date: "2026-02-28",
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null }, // existing
        { data: null, error: null }, // insert
        { data: null, error: null }, // update
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-28",
      );

      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect((updateCall.args[0] as { next_generate_date: string }).next_generate_date).toBe(
        "2026-03-01",
      );
    });

    it("advances across year boundary (Dec 31 → Jan 1)", async () => {
      const template = makeTemplate({
        id: "tmpl-year-end",
        start_date: "2026-12-31",
        next_generate_date: "2026-12-31",
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-12-31",
      );

      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect((updateCall.args[0] as { next_generate_date: string }).next_generate_date).toBe(
        "2027-01-01",
      );
    });

    it("advances across leap-year Feb 28 → Feb 29 in 2028", async () => {
      const template = makeTemplate({
        id: "tmpl-leap",
        start_date: "2028-02-28",
        next_generate_date: "2028-02-28",
      });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2028-02-28",
      );

      const updateCall = expectQuery(queryLog, {
        table: "recurring_tasks",
        method: "update",
      });
      expect((updateCall.args[0] as { next_generate_date: string }).next_generate_date).toBe(
        "2028-02-29",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Error paths (non-fatal — logged but continue)
  // ───────────────────────────────────────────────────────────────────
  describe("error paths (logged, non-fatal)", () => {
    it("logs error with templateId when existing-instances query fails (outer catch swallows)", async () => {
      const template = makeTemplate({ id: "tmpl-existing-err" });

      const { supabase } = createRecordingSupabase([
        { data: [template], error: null },
        { data: null, error: { message: "select failed" } }, // existing query fails
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-existing-err"],
      });

      // Top-level outer-catch logs the thrown Error — check msg + templateId context
      const calls = (log.error as ReturnType<typeof vi.fn>).mock.calls;
      const match = calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("ensureRecurringInstances: failed for template") &&
          c[1] instanceof Error &&
          (c[1] as Error).message.includes("Failed to check existing instances: select failed"),
      );
      expect(match).toBeDefined();
      // Verify context object contains templateId
      expect(match?.[2]).toEqual({ templateId: "tmpl-existing-err" });
    });

    it("logs error and returns early (no template update) when insert fails", async () => {
      const template = makeTemplate({ id: "tmpl-insert-fail" });

      const { supabase, queryLog } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: { message: "insert boom" } }, // insert fails
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-insert-fail"],
      });

      // Insert-specific error is logged
      const calls = (log.error as ReturnType<typeof vi.fn>).mock.calls;
      const match = calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("Failed to insert recurring instances"),
      );
      expect(match).toBeDefined();
      // Context includes templateId and count
      expect(match?.[2]).toEqual({
        templateId: "tmpl-insert-fail",
        count: 4,
      });

      // After insert fails, function returns early — NO template-update call
      const updateCalls = queryLog.filter((q) => q.method === "update");
      expect(updateCalls).toHaveLength(0);
    });

    it("logs error (not throws) when updateTemplateAfterGeneration fails", async () => {
      const template = makeTemplate({ id: "tmpl-update-fail" });

      const { supabase } = createRecordingSupabase([
        { data: [template], error: null },
        { data: [], error: null },
        { data: null, error: null }, // insert ok
        { data: null, error: { message: "update boom" } }, // update fails
      ]);

      await expect(
        ensureRecurringInstances(
          supabase as any,
          USER_ID,
          "2026-02-20",
        ),
      ).resolves.toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-update-fail"],
      });

      const calls = (log.error as ReturnType<typeof vi.fn>).mock.calls;
      const match = calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("Failed to update template after generation"),
      );
      expect(match).toBeDefined();
      expect(match?.[2]).toEqual({ templateId: "tmpl-update-fail" });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Multi-template iteration
  // ───────────────────────────────────────────────────────────────────
  describe("multi-template iteration", () => {
    it("processes each template independently; one failure does not stop others", async () => {
      const tpl1 = makeTemplate({ id: "tmpl-1" });
      const tpl2 = makeTemplate({ id: "tmpl-2" });

      // Sequence: fetch → tpl1 existing (fail) → tpl2 existing → tpl2 insert → tpl2 update
      const { supabase, queryLog } = createRecordingSupabase([
        { data: [tpl1, tpl2], error: null },
        { data: null, error: { message: "tpl1 broke" } }, // tpl1 fails
        { data: [], error: null }, // tpl2 existing
        { data: null, error: null }, // tpl2 insert
        { data: null, error: null }, // tpl2 update
      ]);

      const result = await ensureRecurringInstances(
        supabase as any,
        USER_ID,
        "2026-02-20",
      );

      expect(result).toEqual({
        status: "partial",
        failedTemplateIds: ["tmpl-1"],
      });
      // tpl2 still processed — its insert ran with tpl-2's id
      const insertCall = expectQuery(queryLog, { table: "tasks", method: "insert" });
      const rows = insertCall.args[0] as Array<{ recurring_task_id: string }>;
      expect(rows.every((r) => r.recurring_task_id === "tmpl-2")).toBe(true);

      // Error logged for tpl1
      expect(log.error).toHaveBeenCalled();
    });
  });
});
