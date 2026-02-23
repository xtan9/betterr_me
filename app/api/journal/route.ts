import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { JournalEntriesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { journalEntryFormSchema } from '@/lib/validations/journal';
import { ensureProfile } from '@/lib/db/ensure-profile';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/journal
 * Two modes:
 * - ?date=YYYY-MM-DD  -> returns single entry for that date (or null)
 * - ?mode=timeline&limit=N&cursor=YYYY-MM-DD  -> returns paginated timeline
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const journalDB = new JournalEntriesDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode');

    if (mode === 'timeline') {
      const limitParam = searchParams.get('limit');
      const cursor = searchParams.get('cursor');
      const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : 10;

      const entries = await journalDB.getTimeline(
        user.id,
        limit,
        cursor || undefined
      );

      return NextResponse.json({
        entries,
        hasMore: entries.length === limit,
      });
    }

    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'date query parameter is required' },
        { status: 400 }
      );
    }

    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format (expected YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const entry = await journalDB.getEntryByDate(user.id, date);
    return NextResponse.json({ entry });
  } catch (error) {
    log.error('GET /api/journal error', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entry' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/journal
 * Upsert a journal entry (creates new or updates existing for same user+date).
 * Always returns 201.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, journalEntryFormSchema);
    if (!validation.success) return validation.response;

    // Ensure user profile exists (required by FK constraint)
    await ensureProfile(supabase, user);

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.upsertEntry({
      user_id: user.id,
      entry_date: validation.data.entry_date,
      title: validation.data.title,
      content: validation.data.content ?? { type: 'doc', content: [] },
      mood: validation.data.mood ?? 3,
      word_count: validation.data.word_count ?? 0,
      tags: validation.data.tags ?? [],
      prompt_key: validation.data.prompt_key ?? null,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    log.error('POST /api/journal error', error);
    return NextResponse.json(
      { error: 'Failed to save journal entry' },
      { status: 500 }
    );
  }
}
