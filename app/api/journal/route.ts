import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { JournalEntriesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { journalEntryFormSchema } from '@/lib/validations/journal';
import type { JournalEntryFormValues } from '@/lib/validations/journal';
import { ensureProfile } from '@/lib/db/ensure-profile';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/journal
 * Two modes:
 * - ?date=YYYY-MM-DD  -> returns single entry for that date (or null)
 * - ?mode=timeline&limit=N&cursor=YYYY-MM-DD  -> returns paginated timeline
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

    const journalDB = new JournalEntriesDB(supabase);
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode');

    if (mode === 'timeline') {
      const limitParam = searchParams.get('limit');
      const cursor = searchParams.get('cursor');
      const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : 10;

      const entries = await journalDB.getTimeline(
        userId,
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

    const entry = await journalDB.getEntryByDate(userId, date);
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, journalEntryFormSchema);
    if (!validation.success) return validation.response;

    // Zod .default() guarantees all fields are present after safeParse
    const parsed = validation.data as JournalEntryFormValues;

    // Ensure user profile exists (required by FK constraint)
    await ensureProfile(supabase, {
      id: userId,
      ...auth.principal.profile,
    });

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.upsertEntry({
      user_id: userId,
      entry_date: parsed.entry_date,
      title: parsed.title,
      content: parsed.content,
      mood: parsed.mood,
      word_count: parsed.word_count,
      tags: parsed.tags,
      prompt_key: parsed.prompt_key ?? null,
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
