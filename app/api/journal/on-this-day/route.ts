import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { JournalEntriesDB } from "@/lib/db";
import { log } from "@/lib/logger";
import { getLookbackDates, getLookbackLabel } from "@/lib/journal/streak";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/journal/on-this-day?date=YYYY-MM-DD
 *
 * Returns On This Day entries with full content for the journal page.
 * Separate from /api/journal/today because the journal page needs
 * this data independently from the dashboard widget.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const date = request.nextUrl.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "date query parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const journalDB = new JournalEntriesDB(supabase);
    const lookbackDates = getLookbackDates(date);

    const entries = await journalDB.getEntriesForDates(
      userId,
      lookbackDates.map((d) => d.date)
    );

    const enrichedEntries = entries.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      mood: e.mood,
      title: e.title,
      content: e.content,
      word_count: e.word_count,
      period: getLookbackLabel(date, e.entry_date),
    }));

    return NextResponse.json({ entries: enrichedEntries });
  } catch (error) {
    log.error("GET /api/journal/on-this-day error", error);
    return NextResponse.json(
      { error: "Failed to fetch on-this-day entries" },
      { status: 500 }
    );
  }
}
