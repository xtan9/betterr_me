import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CategoriesDB } from '@/lib/db/categories';
import { validateRequestBody } from '@/lib/validations/api';
import { categoryUpdateSchema } from '@/lib/validations/category';
import { log } from '@/lib/logger';

/**
 * PUT /api/categories/[id]
 * Update a category
 */
export async function PUT(
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

    const body = await request.json();
    const validation = validateRequestBody(body, categoryUpdateSchema);
    if (!validation.success) return validation.response;

    const categoriesDB = new CategoriesDB(supabase);
    const category = await categoriesDB.updateCategory(id, user.id, validation.data);

    return NextResponse.json({ category });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    log.error('PUT /api/categories/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/categories/[id]
 * Delete a category
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

    const categoriesDB = new CategoriesDB(supabase);
    await categoriesDB.deleteCategory(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/categories/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
