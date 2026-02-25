import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { JournalEntriesDB } from "@/lib/db";
import { log } from "@/lib/logger";
import {
  computeStreak,
  getLookbackDates,
  getLookbackLabel,
} from "@/lib/journal/streak";

/**
 * GET /api/journal/today?date=YYYY-MM-DD
 *
 * Aggregated endpoint returning:
 * - Today's journal entry (or null)
 * - Current writing streak count
 * - On This Day entries (30d, 90d, 1y ago)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = request.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "date query parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const journalDB = new JournalEntriesDB(supabase);
    const lookbackDates = getLookbackDates(date);

    // Execute 3 queries in parallel
    const [entry, recentDates, lookbackEntries] = await Promise.all([
      journalDB.getEntryByDate(user.id, date),
      journalDB.getRecentEntryDates(user.id, date, 400),
      journalDB.getEntriesForDates(
        user.id,
        lookbackDates.map((d) => d.date)
      ),
    ]);

    const streak = computeStreak(recentDates, date);

    // Build On This Day entries with period labels
    const onThisDay = lookbackEntries.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      mood: e.mood,
      title: e.title,
      content: e.content,
      word_count: e.word_count,
      period: getLookbackLabel(date, e.entry_date),
    }));

    // Build today's entry response (subset of fields)
    const todayEntry = entry
      ? {
          id: entry.id,
          mood: entry.mood,
          title: entry.title,
          content: entry.content,
          word_count: entry.word_count,
        }
      : null;

    return NextResponse.json({
      entry: todayEntry,
      streak,
      on_this_day: onThisDay,
    });
  } catch (error) {
    log.error("GET /api/journal/today error", error);
    return NextResponse.json(
      { error: "Failed to fetch journal today data" },
      { status: 500 }
    );
  }
}
