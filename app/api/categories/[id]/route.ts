import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { CategoriesDB } from '@/lib/db/categories';
import { validateRequestBody } from '@/lib/validations/api';
import { categoryUpdateSchema } from '@/lib/validations/category';
import { log } from '@/lib/logger';

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, categoryUpdateSchema);
    if (!validation.success) return validation.response;

    const categoriesDB = new CategoriesDB(supabase);
    const category = await categoriesDB.updateCategory(id, userId, validation.data);

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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const categoriesDB = new CategoriesDB(supabase);
    await categoriesDB.deleteCategory(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/categories/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
