import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/auth/callback/route';

// Mock the server-side Supabase client
const mockExchangeCodeForSession = vi.fn();

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError, warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    })
  ),
}));

describe('GET /auth/callback', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogError.mockClear();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should exchange code for session and redirect to origin on success in development', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new Request('http://localhost:3000/auth/callback?code=test-code');
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('test-code');
    expect(response.status).toBe(307); // Redirect status
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('should redirect to "next" parameter if provided', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new Request('http://localhost:3000/auth/callback?code=test-code&next=/dashboard');
    const response = await GET(request);

    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('should ignore absolute URLs in "next" parameter', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new Request(
      'http://localhost:3000/auth/callback?code=test-code&next=https://evil.com/hack'
    );
    const response = await GET(request);

    // Should redirect to root instead of the absolute URL
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('should redirect to error page when code is missing', async () => {
    const request = new Request('http://localhost:3000/auth/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/auth-code-error');
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('should redirect to error page when session exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: new Error('Invalid code') });

    const request = new Request('http://localhost:3000/auth/callback?code=invalid-code');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/auth-code-error');
  });

  it('should log error when session exchange fails', async () => {
    const sessionError = new Error('Invalid code');
    mockExchangeCodeForSession.mockResolvedValue({ error: sessionError });

    const request = new Request('http://localhost:3000/auth/callback?code=invalid-code');
    await GET(request);

    expect(mockLogError).toHaveBeenCalledWith(
      'Auth callback: code exchange failed',
      sessionError,
    );
  });

  it('should use x-forwarded-host in production environment', async () => {
    process.env.NODE_ENV = 'production';
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new Request('http://localhost:3000/auth/callback?code=test-code', {
      headers: {
        'x-forwarded-host': 'myapp.example.com',
      },
    });
    const response = await GET(request);

    expect(response.headers.get('location')).toBe('https://myapp.example.com/');
  });

  it('should use origin in production when no x-forwarded-host', async () => {
    process.env.NODE_ENV = 'production';
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const request = new Request('http://localhost:3000/auth/callback?code=test-code');
    const response = await GET(request);

    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });
});
