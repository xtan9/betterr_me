import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted mocks
const { mockStreamText, mockToDataStreamResponse } = vi.hoisted(() => {
  const mockToDataStreamResponse = vi.fn();
  const mockStreamText = vi.fn(() => ({
    toDataStreamResponse: mockToDataStreamResponse,
  }));
  return { mockStreamText, mockToDataStreamResponse };
});

const { mockCreateClient, mockGetUser } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
}));

// Mock modules
vi.mock('ai', () => ({
  streamText: mockStreamText,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/lib/ai/provider', () => ({
  llmProvider: vi.fn((model: string) => `mock-model:${model}`),
}));

import { POST, maxDuration } from '@/app/api/chat/route';

function makeRequest(body: unknown, options?: { signal?: AbortSignal }) {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', email: 'test@example.com' } } });
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });

    // Default: streaming response mock
    const mockResponse = new Response('streamed data', { status: 200 });
    mockToDataStreamResponse.mockReturnValue(mockResponse);
  });

  it('should return 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (empty messages array)', async () => {
    const req = makeRequest({ messages: [] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should return 400 for missing messages field', async () => {
    const req = makeRequest({});
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should return 400 for invalid JSON', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON');
  });

  it('should call streamText with correct parameters', async () => {
    const messages = [{ role: 'user' as const, content: 'Hello' }];
    const req = makeRequest({ messages });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.anything(),
        messages,
        maxTokens: expect.any(Number),
        abortSignal: req.signal,
      })
    );
  });

  it('should use LLM_MODEL env var with fallback', async () => {
    const originalModel = process.env.LLM_MODEL;
    delete process.env.LLM_MODEL;

    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    await POST(req);

    // The llmProvider mock returns `mock-model:${model}`
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-model:claude-sonnet-4-20250514',
      })
    );

    process.env.LLM_MODEL = originalModel;
  });

  it('should use LLM_MAX_TOKENS env var with fallback to 4096', async () => {
    const originalTokens = process.env.LLM_MAX_TOKENS;
    delete process.env.LLM_MAX_TOKENS;

    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 4096,
      })
    );

    process.env.LLM_MAX_TOKENS = originalTokens;
  });

  it('should return streaming response from toDataStreamResponse', async () => {
    const mockResponse = new Response('streamed', { status: 200 });
    mockToDataStreamResponse.mockReturnValue(mockResponse);

    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    const response = await POST(req);

    expect(response).toBe(mockResponse);
    expect(mockToDataStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        }),
      })
    );
  });

  it('should return 502 when streamText throws (proxy unreachable)', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });

    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Failed to reach AI service. Please try again.');
  });

  it('should export maxDuration as 60', () => {
    expect(maxDuration).toBe(60);
  });

  it('should pass abort signal from request', async () => {
    const req = makeRequest({ messages: [{ role: 'user', content: 'Hello' }] });
    await POST(req);

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
