import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { ProjectsDB } from '@/lib/db';
import { createProjectWrites, toProjectResponse } from '@/lib/projects/writes';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;
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
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, projectUpdateSchema);
    if (!validation.success) return validation.response;

    const outcome = await createProjectWrites(supabase).update({
      userId,
      projectId: id,
      ...(validation.data.name !== undefined
        ? { name: validation.data.name }
        : {}),
      ...(validation.data.section !== undefined
        ? { section: validation.data.section }
        : {}),
      ...(validation.data.color !== undefined
        ? { color: validation.data.color }
        : {}),
      ...(validation.data.status !== undefined
        ? { status: validation.data.status }
        : {}),
      ...(validation.data.sort_order !== undefined
        ? { sortOrder: validation.data.sort_order }
        : {}),
    });

    if (outcome.type === 'not-found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (outcome.type === 'conflict') {
      return NextResponse.json(
        { error: 'Project update conflict' },
        { status: 409 },
      );
    }
    if (outcome.type === 'invalid') {
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
    }

    return NextResponse.json({ project: toProjectResponse(outcome.project) });
  } catch (error: unknown) {
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
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
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
