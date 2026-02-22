import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CategoriesDB } from '@/lib/db/categories';
import { validateRequestBody } from '@/lib/validations/api';
import { categoryCreateSchema } from '@/lib/validations/category';
import { log } from '@/lib/logger';

/**
 * GET /api/categories
 * Get categories for the authenticated user (lazy-seeds defaults on first call)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categoriesDB = new CategoriesDB(supabase);
    const categories = await categoriesDB.seedCategories(user.id);

    return NextResponse.json({ categories });
  } catch (error) {
    log.error('GET /api/categories error', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/categories
 * Create a new category
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
    const validation = validateRequestBody(body, categoryCreateSchema);
    if (!validation.success) return validation.response;

    const { name, color, icon } = validation.data;

    const categoriesDB = new CategoriesDB(supabase);
    const existing = await categoriesDB.getUserCategories(user.id);

    const category = await categoriesDB.createCategory({
      user_id: user.id,
      name,
      color,
      icon: icon ?? null,
      sort_order: existing.length,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    log.error('POST /api/categories error', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
