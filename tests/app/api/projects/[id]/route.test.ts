import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/projects/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

const mockProjectsDB = {
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProjectsDB: class {
    constructor() {
      return mockProjectsDB;
    }
  },
}));

import { createClient } from '@/lib/supabase/server';

function resetAuthMock() {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  } as any);
}

describe('GET /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthMock();
  });

  it('should return project by ID', async () => {
    const mockProject = {
      id: 'p1',
      user_id: 'user-123',
      name: 'Project 1',
      section: 'personal',
      color: 'blue',
    };
    vi.mocked(mockProjectsDB.getProject).mockResolvedValue(mockProject);

    const request = new NextRequest('http://localhost:3000/api/projects/p1');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.project).toEqual(mockProject);
    expect(mockProjectsDB.getProject).toHaveBeenCalledWith('p1', 'user-123');
  });

  it('should return 404 if project not found', async () => {
    vi.mocked(mockProjectsDB.getProject).mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost:3000/api/projects/nonexistent'
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: 'nonexistent' }),
    });

    expect(response.status).toBe(404);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects/p1');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthMock();
  });

  it('should update project', async () => {
    const updatedProject = {
      id: 'p1',
      user_id: 'user-123',
      name: 'Updated',
      section: 'work',
      color: 'red',
    };
    vi.mocked(mockProjectsDB.updateProject).mockResolvedValue(updatedProject);

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated', section: 'work', color: 'red' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.project).toEqual(updatedProject);
  });

  it('should return 400 if no valid updates', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 if name exceeds max length', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'A'.repeat(51) }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthMock();
  });

  it('should delete project', async () => {
    vi.mocked(mockProjectsDB.deleteProject).mockResolvedValue();

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockProjectsDB.deleteProject).toHaveBeenCalledWith(
      'p1',
      'user-123'
    );
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(401);
  });
});
