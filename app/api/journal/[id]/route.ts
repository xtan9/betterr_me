import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { JournalEntriesDB } from '@/lib/db';
import { createJournalWrites, toJournalEntryResponse } from '@/lib/journal/writes';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { journalEntryUpdateSchema } from '@/lib/validations/journal';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/journal/[id]
 * Get a single journal entry by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.getEntry(id, userId);

    if (!entry) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ entry });
  } catch (error) {
    log.error('GET /api/journal/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entry' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/journal/[id]
 * Update a journal entry with validated partial data
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const validation = validateRequestBody(body, journalEntryUpdateSchema);
    if (!validation.success) return validation.response;

    const changes = validation.data;
    const outcome = await createJournalWrites(supabase).save({
      userId,
      entryId: id,
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.content !== undefined ? { content: changes.content } : {}),
      ...(changes.mood !== undefined ? { mood: changes.mood } : {}),
      ...(changes.word_count !== undefined
        ? { wordCount: changes.word_count }
        : {}),
      ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
      ...(changes.prompt_key !== undefined
        ? { promptKey: changes.prompt_key }
        : {}),
    });

    if (outcome.type === 'invalid') {
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
    }
    if (outcome.type === 'conflict') {
      return NextResponse.json(
        { error: 'Journal entry conflict' },
        { status: 409 },
      );
    }
    if (outcome.type === 'not-found') {
      log.warn("PATCH /api/journal/[id]: entry not found", { entryId: id });
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ entry: toJournalEntryResponse(outcome.entry) });
  } catch (error) {
    log.error('PATCH /api/journal/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to update journal entry' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/journal/[id]
 * Remove a journal entry
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const journalDB = new JournalEntriesDB(supabase);
    await journalDB.deleteEntry(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/journal/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete journal entry' },
      { status: 500 }
    );
  }
}
