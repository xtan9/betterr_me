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
};

const mockProjectUpdate = vi.fn();
const mockProjectDelete = vi.fn();

vi.mock('@/lib/db', () => ({
  ProjectsDB: class {
    constructor() {
      return mockProjectsDB;
    }
  },
}));

vi.mock('@/lib/projects/writes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/projects/writes')>(
    '@/lib/projects/writes',
  );
  return {
    ...actual,
    createProjectWrites: vi.fn(() => ({
      update: mockProjectUpdate,
      delete: mockProjectDelete,
    })),
  };
});

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
      userId: 'user-123',
      name: 'Updated',
      section: 'work',
      color: 'red',
      status: 'active',
      sortOrder: 131072,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    mockProjectUpdate.mockResolvedValue({ type: 'updated', project: updatedProject });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Updated',
        section: 'work',
        color: 'red',
        sort_order: 131072,
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.project).toEqual({
      id: 'p1',
      user_id: 'user-123',
      name: 'Updated',
      section: 'work',
      color: 'red',
      status: 'active',
      sort_order: 131072,
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    });
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      userId: 'user-123',
      projectId: 'p1',
      name: 'Updated',
      section: 'work',
      color: 'red',
      sortOrder: 131072,
    });
    expect(mockProjectsDB.getProject).not.toHaveBeenCalled();
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

  it('should archive a project', async () => {
    const archivedProject = {
      id: 'p1',
      userId: 'user-123',
      name: 'Project 1',
      section: 'personal',
      color: 'blue',
      status: 'archived',
      sortOrder: 65536,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    mockProjectUpdate.mockResolvedValue({ type: 'updated', project: archivedProject });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.project.status).toBe('archived');
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      userId: 'user-123',
      projectId: 'p1',
      status: 'archived',
    });
  });

  it('should restore an archived project', async () => {
    const restoredProject = {
      id: 'p1',
      userId: 'user-123',
      name: 'Project 1',
      section: 'personal',
      color: 'blue',
      status: 'active',
      sortOrder: 65536,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    mockProjectUpdate.mockResolvedValue({ type: 'updated', project: restoredProject });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.project.status).toBe('active');
    expect(mockProjectUpdate).toHaveBeenCalledWith({
      userId: 'user-123',
      projectId: 'p1',
      status: 'active',
    });
  });

  it('maps a missing or cross-owner project outcome to the existing 404 contract', async () => {
    mockProjectUpdate.mockResolvedValue({ type: 'not-found' });

    const request = new NextRequest('http://localhost:3000/api/projects/private', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Private name' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'private' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Project not found' });
  });

  it('returns an already-applied archive outcome as a successful idempotent response', async () => {
    const archivedProject = {
      id: 'p1',
      userId: 'user-123',
      name: 'Project 1',
      section: 'personal',
      color: 'blue',
      status: 'archived',
      sortOrder: 65536,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    mockProjectUpdate.mockResolvedValue({
      type: 'already-applied',
      project: archivedProject,
    });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).project.status).toBe('archived');
  });

  it('maps a shared invalid outcome to the existing HTTP validation contract', async () => {
    mockProjectUpdate.mockResolvedValue({
      type: 'invalid',
      field: 'sortOrder',
      message: 'Sort order must be a non-negative finite number',
    });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ sort_order: 1 }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Sort order must be a non-negative finite number',
      field: 'sortOrder',
    });
  });

  it('does not infer a typed outcome from an unexpected update failure', async () => {
    mockProjectUpdate.mockRejectedValue(new Error('not found while updating'));

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to update project' });
  });

  it('should reject invalid status value', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted' }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
    expect(mockProjectUpdate).not.toHaveBeenCalled();
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

  it('should delete project through the mutation command', async () => {
    mockProjectDelete.mockResolvedValue({ type: 'deleted' });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'p1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockProjectDelete).toHaveBeenCalledWith({
      projectId: 'p1',
      userId: 'user-123',
    });
    expect(mockProjectsDB.getProject).not.toHaveBeenCalled();
  });

  it.each(['missing', 'repeated', 'cross-owner'])('returns 404 for the %s deletion outcome', async () => {
    mockProjectDelete.mockResolvedValue({ type: 'not-found' });

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Project not found' });
  });

  it('maps an unexpected mutation failure to a server error', async () => {
    mockProjectDelete.mockRejectedValue(new Error('database unavailable'));

    const request = new NextRequest('http://localhost:3000/api/projects/p1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to delete project' });
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
