import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';
import { NextRequest } from 'next/server';

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
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

const mockProjectsDB = {
  getUserProjects: vi.fn(),
  createProject: vi.fn(),
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

import { createClient } from '@/lib/supabase/server';

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(mockProjectsDB.createProject).mockResolvedValue(newProject);

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
    expect(mockProjectsDB.createProject).toHaveBeenCalledWith({
      user_id: 'user-123',
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
    vi.mocked(mockProjectsDB.createProject).mockResolvedValue({
      id: 'p1',
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
    vi.mocked(mockProjectsDB.createProject).mockResolvedValue({
      id: 'p1',
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

    expect(mockProjectsDB.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed Name' })
    );
  });
});
