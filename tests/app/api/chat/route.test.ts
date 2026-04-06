import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted mocks
const { mockStreamText, mockToTextStreamResponse } = vi.hoisted(() => {
  const mockToTextStreamResponse = vi.fn();
  const mockStreamText = vi.fn(() => ({
    toTextStreamResponse: mockToTextStreamResponse,
  }));
  return { mockStreamText, mockToTextStreamResponse };
});

const { mockCreateClient, mockGetUser } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
}));

const { mockLogError, mockLogWarn } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockLogWarn: vi.fn(),
}));

const { mockConvertToModelMessages } = vi.hoisted(() => ({
  mockConvertToModelMessages: vi.fn(async (msgs: unknown[]) =>
    msgs.map((m: { role?: string; parts?: { type: string; text: string }[] }) => ({
      role: m.role,
      content: m.parts?.find((p: { type: string }) => p.type === 'text')?.text ?? '',
    }))
  ),
}));

// Mock modules
vi.mock('ai', () => ({
  streamText: mockStreamText,
  convertToModelMessages: mockConvertToModelMessages,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/lib/ai/provider', () => ({
  llmProvider: vi.fn((model: string) => `mock-model:${model}`),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError, warn: mockLogWarn },
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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', email: 'test@example.com' } } });
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });

    // Default: streaming response mock
    const mockResponse = new Response('streamed data', { status: 200 });
    mockToTextStreamResponse.mockReturnValue(mockResponse);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 503 when LLM_API_KEY is not set', async () => {
    delete process.env.LLM_API_KEY;

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('AI service is not configured.');
    expect(mockLogError).toHaveBeenCalledWith('POST /api/chat failed: LLM_API_KEY not configured');
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

  it('should return 400 for invalid JSON and log warning', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON in request body');
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it('should call streamText with correct parameters including onError', async () => {
    const messages = [{ id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello' }] }];
    const req = makeRequest({ messages });
    await POST(req);

    expect(mockConvertToModelMessages).toHaveBeenCalledWith(messages);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.anything(),
        messages: expect.any(Array),
        maxOutputTokens: expect.any(Number),
        abortSignal: req.signal,
        onError: expect.any(Function),
      })
    );
  });

  it('should use LLM_MODEL env var with fallback', async () => {
    delete process.env.LLM_MODEL;

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-model:claude-sonnet-4-20250514',
      })
    );
  });

  it('should use LLM_MAX_TOKENS env var with fallback to 4096', async () => {
    delete process.env.LLM_MAX_TOKENS;

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 4096,
      })
    );
  });

  it('should use custom LLM_MAX_TOKENS when set', async () => {
    process.env.LLM_MAX_TOKENS = '2048';

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 2048,
      })
    );
  });

  it('should return streaming response with correct headers', async () => {
    const mockResponse = new Response('streamed', { status: 200 });
    mockToTextStreamResponse.mockReturnValue(mockResponse);

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);

    expect(response).toBe(mockResponse);
    expect(mockToTextStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        }),
      })
    );
  });

  it('should log stream errors via onError callback', async () => {
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockStreamText.mock.calls as any[][])[0][0];
    const testError = new Error('stream failure');
    callArgs.onError({ error: testError });
    expect(mockLogError).toHaveBeenCalledWith('LLM stream error', testError);
  });

  it('should return 502 when streamText throws (proxy unreachable)', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Failed to reach AI service. Please try again.');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('should return 499 for aborted requests', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockStreamText.mockImplementation(() => {
      throw abortError;
    });

    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);

    expect(response.status).toBe(499);
  });

  it('should export maxDuration as 60', () => {
    expect(maxDuration).toBe(60);
  });

  it('should pass abort signal from request', async () => {
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockStreamText.mock.calls as any[][])[0][0];
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
