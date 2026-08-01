import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, cookieRouteErrorMessage } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { CategoriesDB } from '@/lib/db/categories';
import { validateRequestBody } from '@/lib/validations/api';
import { categoryCreateSchema } from '@/lib/validations/category';
import { log } from '@/lib/logger';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/categories
 * Get categories for the authenticated user (lazy-seeds defaults on first call)
 */
export async function GET(request: Request = new Request('http://localhost')) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const categoriesDB = new CategoriesDB(supabase);
    const categories = await categoriesDB.seedCategories(userId);

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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, categoryCreateSchema);
    if (!validation.success) return validation.response;

    const { name, color, icon } = validation.data;

    const categoriesDB = new CategoriesDB(supabase);
    const existing = await categoriesDB.getUserCategories(userId);

    const category = await categoriesDB.createCategory({
      user_id: userId,
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
