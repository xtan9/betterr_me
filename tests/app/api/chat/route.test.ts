import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockStreamText, mockToUIMessageStreamResponse } = vi.hoisted(() => {
  const mockToUIMessageStreamResponse = vi.fn();
  const mockStreamText = vi.fn(() => ({
    toUIMessageStreamResponse: mockToUIMessageStreamResponse,
  }));
  return { mockStreamText, mockToUIMessageStreamResponse };
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

const { mockCreateChatTools } = vi.hoisted(() => ({
  mockCreateChatTools: vi.fn().mockResolvedValue({}),
}));

const { mockCheckChatRateLimit } = vi.hoisted(() => ({
  mockCheckChatRateLimit: vi.fn(),
}));

vi.mock('ai', () => ({
  streamText: mockStreamText,
  convertToModelMessages: mockConvertToModelMessages,
  stepCountIs: vi.fn((n: number) => ({ type: 'step-count', value: n })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/lib/ai/provider', () => ({
  llmProvider: vi.fn((model: string) => `mock-model:${model}`),
  webSearchTool: { type: 'provider-defined', id: 'web_search' },
  createMemoryTool: vi.fn(() => ({ type: 'provider-defined', id: 'memory' })),
}));

vi.mock('@/lib/ai/rate-limit', () => ({
  checkChatRateLimit: mockCheckChatRateLimit,
}));

vi.mock('@/lib/ai/tools', () => ({
  createChatTools: mockCreateChatTools,
}));

vi.mock('@/lib/ai/system-prompt', () => ({
  buildIdentityMessages: vi.fn(({ date, timezone }: { date: string; timezone: string }) => [
    { role: 'user', content: [{ type: 'text', text: 'Hi, who are you?' }] },
    { role: 'assistant', content: [{ type: 'text', text: `I'm BetterR.Me Assistant. Today is ${date} (${timezone}).` }] },
  ]),
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

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', email: 'test@example.com' } } });
    mockCheckChatRateLimit.mockResolvedValue({
      allowed: true,
      minuteRemaining: 9,
      dayRemaining: 99,
    });
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });

    const mockResponse = new Response('streamed data', { status: 200 });
    mockToUIMessageStreamResponse.mockReturnValue(mockResponse);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it('should return 503 when LLM_API_KEY is not set', async () => {
    delete process.env.LLM_API_KEY;
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(503);
  });

  it('should return 400 for empty messages array', async () => {
    const req = makeRequest({ messages: [] });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('should return 400 for too many messages (over 40)', async () => {
    const messages = Array.from({ length: 41 }, (_, i) => ({
      id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', parts: [{ type: 'text', text: `msg ${i}` }],
    }));
    const req = makeRequest({ messages });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('should return 429 when the per-user usage quota is exceeded', async () => {
    mockCheckChatRateLimit.mockResolvedValue({ allowed: false, reason: 'exceeded' });
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('should fail closed when the quota service is unavailable', async () => {
    mockCheckChatRateLimit.mockResolvedValue({ allowed: false, reason: 'unavailable' });
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(503);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('should reject request bodies larger than 256 KiB before model conversion', async () => {
    const req = makeRequest({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(270_000) }] }],
    });
    const response = await POST(req);
    expect(response.status).toBe(413);
    expect(mockConvertToModelMessages).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid JSON', async () => {
    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('should call streamText with tools, identity messages, and stopWhen', async () => {
    const messages = [{ id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello' }] }];
    const req = makeRequest({ messages, date: '2026-04-08', timezone: 'America/Toronto' });
    await POST(req);

    expect(mockCreateChatTools).toHaveBeenCalledWith({
      userId: 'user-123',
      supabase: expect.anything(),
      date: '2026-04-08',
      timezone: 'America/Toronto',
    });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.anything(),
        tools: expect.any(Object),
        stopWhen: expect.anything(),
        messages: expect.any(Array),
      })
    );
    // Verify identity messages are prepended before user messages
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.maxOutputTokens).toBe(2048);
    expect(callArgs.messages[0]).toEqual(
      expect.objectContaining({ role: 'user', content: [{ type: 'text', text: 'Hi, who are you?' }] }),
    );
    expect(callArgs.messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant' }),
    );
    // User's actual message follows the priming
    expect(callArgs.messages[2]).toEqual(
      expect.objectContaining({ role: 'user' }),
    );
    // No system prompt — identity is embedded in priming messages
    expect(callArgs.system).toBeUndefined();
  });

  it('strips ephemeral provider metadata before converting follow-up messages', async () => {
    const messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Hi there',
            providerMetadata: { openai: { itemId: 'msg_ephemeral' } },
          },
        ],
      },
      { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'Follow up' }] },
    ];

    await POST(makeRequest({ messages }));

    expect(mockConvertToModelMessages).toHaveBeenCalledWith([
      messages[0],
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there' }],
      },
      messages[2],
    ]);
  });

  it('should use toUIMessageStreamResponse with correct headers', async () => {
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);

    expect(mockToUIMessageStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        }),
      })
    );
    expect(response.status).toBe(200);
  });

  it('should fall back to UTC today when date/timezone not provided', async () => {
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    await POST(req);

    expect(mockCreateChatTools).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'UTC',
      })
    );
  });

  it('should return 400 when an invalid model is sent', async () => {
    const req = makeRequest({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      model: 'gpt-4-invalid',
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('should return 502 when streamText throws', async () => {
    mockStreamText.mockImplementation(() => { throw new Error('ECONNREFUSED'); });
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(502);
  });

  it('should return 499 for aborted requests', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockStreamText.mockImplementation(() => { throw abortError; });
    const req = makeRequest({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }] });
    const response = await POST(req);
    expect(response.status).toBe(499);
  });

  it('should export maxDuration as 60', () => {
    expect(maxDuration).toBe(60);
  });
});
