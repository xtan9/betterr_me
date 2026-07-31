import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { ProjectsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { log } from '@/lib/logger';
import { projectFormSchema } from '@/lib/validations/project';
import { ensureProfile } from '@/lib/db/ensure-profile';
import type { ProjectSection, ProjectStatus } from '@/lib/db/types';

const READ_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/projects
 * Get projects for the authenticated user with optional filters
 *
 * Query parameters:
 * - section: 'personal' | 'work'
 * - status: 'active' | 'archived' (default: 'active')
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const projectsDB = new ProjectsDB(supabase);
    const searchParams = request.nextUrl.searchParams;

    const validSections: string[] = ['personal', 'work'];
    const validStatuses: string[] = ['active', 'archived'];

    const filters: { section?: ProjectSection; status?: ProjectStatus } = {};
    const sectionParam = searchParams.get('section');
    if (sectionParam && validSections.includes(sectionParam)) {
      filters.section = sectionParam as ProjectSection;
    }
    const statusParam = searchParams.get('status');
    if (statusParam && validStatuses.includes(statusParam)) {
      filters.status = statusParam as ProjectStatus;
    }

    const projects = await projectsDB.getUserProjects(userId, filters);
    return NextResponse.json({ projects });
  } catch (error) {
    log.error('GET /api/projects error', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();

    // Validate with Zod schema
    const validation = validateRequestBody(body, projectFormSchema);
    if (!validation.success) return validation.response;

    // Ensure user profile exists (required by FK constraint on projects.user_id).
    // Skip for API key auth — users must log in via web to create keys,
    // so their profile already exists.
    if (!request.headers.get('authorization')?.startsWith('Bearer brm_')) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await ensureProfile(supabase, user);
    }

    const projectsDB = new ProjectsDB(supabase);
    const project = await projectsDB.createProject({
      user_id: userId,
      name: validation.data.name.trim(),
      section: validation.data.section,
      color: validation.data.color,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    log.error('POST /api/projects error', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
