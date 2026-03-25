import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiKeysDB } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * DELETE /api/api-keys/[id]
 * Delete an API key
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

    const apiKeysDB = new ApiKeysDB(supabase);
    await apiKeysDB.deleteKey(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/api-keys/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}
