import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  USER_API_READ_POLICY,
  USER_API_WRITE_POLICY,
} from '@/lib/auth/authenticated-request';
import { ProjectsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { projectUpdateSchema } from '@/lib/validations/project';

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, USER_API_READ_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const projectsDB = new ProjectsDB(supabase);
    const project = await projectsDB.getProject(id, userId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    log.error('GET /api/projects/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Update a project
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, projectUpdateSchema);
    if (!validation.success) return validation.response;

    const projectsDB = new ProjectsDB(supabase);
    const project = await projectsDB.updateProject(id, userId, validation.data);

    return NextResponse.json({ project });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    log.error('PATCH /api/projects/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, USER_API_WRITE_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const projectsDB = new ProjectsDB(supabase);
    await projectsDB.deleteProject(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('DELETE /api/projects/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
