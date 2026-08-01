import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';
import { NextRequest } from 'next/server';

const { mockEnsureProfile, mockProjectCreate } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
  mockProjectCreate: vi.fn(),
}));
const apiKeyMocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  queryLog: [] as Array<{
    table: string;
    method: string;
    args: unknown[];
  }>,
}));

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })),
    },
  })),
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => ({
      from: apiKeyMocks.from,
    })),
  };
});

const mockProjectsDB = {
  getUserProjects: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProjectsDB: class {
    constructor() {
      return mockProjectsDB;
    }
  },
}));

vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock('@/lib/projects/writes', () => ({
  createProjectWrites: vi.fn(() => ({ create: mockProjectCreate })),
  toProjectResponse: vi.fn((project) => project),
}));

import { createClient } from '@/lib/supabase/server';
import { hashApiKey } from '@/lib/auth/api-key';

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('API_KEY_HMAC_SECRET', 'test-hmac-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    apiKeyMocks.queryLog.length = 0;
    apiKeyMocks.from.mockImplementation((table: string) => {
      apiKeyMocks.queryLog.push({ table, method: 'from', args: [table] });
      return {
        select: (...selectArgs: unknown[]) => {
          apiKeyMocks.queryLog.push({
            table,
            method: 'select',
            args: selectArgs,
          });
          return {
            eq: (...eqArgs: unknown[]) => {
              apiKeyMocks.queryLog.push({ table, method: 'eq', args: eqArgs });
              return {
                maybeSingle: (...singleArgs: unknown[]) => {
                  apiKeyMocks.queryLog.push({
                    table,
                    method: 'maybeSingle',
                    args: singleArgs,
                  });
                  return apiKeyMocks.maybeSingle(...singleArgs);
                },
              };
            },
          };
        },
      };
    });
  });

  it('should return projects for authenticated user', async () => {
    const mockProjects = [
      { id: 'p1', user_id: 'user-123', name: 'Project 1', section: 'personal' },
    ];
    vi.mocked(mockProjectsDB.getUserProjects).mockResolvedValue(mockProjects);

    const request = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projects).toEqual(mockProjects);
    expect(mockProjectsDB.getUserProjects).toHaveBeenCalledWith('user-123', {});
  });

  it('should filter by section query param', async () => {
    vi.mocked(mockProjectsDB.getUserProjects).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost:3000/api/projects?section=work'
    );
    await GET(request);

    expect(mockProjectsDB.getUserProjects).toHaveBeenCalledWith('user-123', {
      section: 'work',
    });
  });

  it('should filter by status query param', async () => {
    vi.mocked(mockProjectsDB.getUserProjects).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost:3000/api/projects?status=archived'
    );
    await GET(request);

    expect(mockProjectsDB.getUserProjects).toHaveBeenCalledWith('user-123', {
      status: 'archived',
    });
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should enforce write permission for an API key', async () => {
    apiKeyMocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'read-only-key',
        user_id: 'api-user',
        permissions: 'read',
        expires_at: null,
      },
      error: null,
    });

    const response = await POST(
      new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { authorization: 'Bearer brm_readonly' },
        body: JSON.stringify({
          name: 'Not allowed',
          section: 'personal',
          color: 'blue',
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mockProjectCreate).not.toHaveBeenCalled();
    expect(apiKeyMocks.queryLog).toEqual([
      { table: 'api_keys', method: 'from', args: ['api_keys'] },
      {
        table: 'api_keys',
        method: 'select',
        args: ['id, user_id, permissions, expires_at'],
      },
      {
        table: 'api_keys',
        method: 'eq',
        args: ['key_hash', hashApiKey('brm_readonly')],
      },
      { table: 'api_keys', method: 'maybeSingle', args: [] },
    ]);
  });
});

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
    mockProjectCreate.mockResolvedValue({
      type: 'created',
      project: { id: 'p1' },
    });
  });

  it('should create a new project', async () => {
    const newProject = {
      id: 'p1',
      user_id: 'user-123',
      name: 'New Project',
      section: 'personal',
      color: 'blue',
      status: 'active',
    };
    mockProjectCreate.mockResolvedValue({
      type: 'created',
      project: newProject,
    });

    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Project',
        section: 'personal',
        color: 'blue',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.project).toEqual(newProject);
    expect(mockProjectCreate).toHaveBeenCalledWith({
      userId: 'user-123',
      name: 'New Project',
      section: 'personal',
      color: 'blue',
    });
  });

  it('should return 400 if name is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({ section: 'personal', color: 'blue' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should return 400 if section is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Project',
        section: 'invalid',
        color: 'blue',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('should return 400 if color is empty', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Project',
        section: 'personal',
        color: '',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Project',
        section: 'personal',
        color: 'blue',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should call ensureProfile before creating project', async () => {
    mockProjectCreate.mockResolvedValue({
      type: 'created',
      project: { id: 'p1' },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Project',
        section: 'personal',
        color: 'blue',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });

  it('should trim project name', async () => {
    mockProjectCreate.mockResolvedValue({
      type: 'created',
      project: { id: 'p1' },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Trimmed Name  ',
        section: 'personal',
        color: 'blue',
      }),
    });

    await POST(request);

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed Name' })
    );
  });
});
