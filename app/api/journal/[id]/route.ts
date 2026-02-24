import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { JournalEntriesDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { journalEntryUpdateSchema } from '@/lib/validations/journal';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.getEntry(id, user.id);

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, journalEntryUpdateSchema);
    if (!validation.success) return validation.response;

    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.updateEntry(id, user.id, validation.data);

    return NextResponse.json({ entry });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'PGRST116'
    ) {
      log.warn("PATCH /api/journal/[id]: entry not found", { entryId: id });
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const journalDB = new JournalEntriesDB(supabase);
    await journalDB.deleteEntry(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/journal/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete journal entry' },
      { status: 500 }
    );
  }
}
