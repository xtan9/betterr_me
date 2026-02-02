import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/auth/confirm/route';
import { NextRequest } from 'next/server';

// Mock next/navigation redirect - it throws a special NEXT_REDIRECT error
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Mock the server-side Supabase client
const mockVerifyOtp = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        verifyOtp: mockVerifyOtp,
      },
    })
  ),
}));

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should verify OTP and redirect to root on success', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/auth/confirm?token_hash=valid-token&type=email'
    );

    await expect(GET(request)).rejects.toThrow('NEXT_REDIRECT:/');
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'email',
      token_hash: 'valid-token',
    });
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('should redirect to "next" parameter if provided', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/auth/confirm?token_hash=valid-token&type=email&next=/dashboard'
    );

    await expect(GET(request)).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('should redirect to error page with message when OTP verification fails', async () => {
    const error = { message: 'Invalid or expired token' };
    mockVerifyOtp.mockResolvedValue({ error });

    const request = new NextRequest(
      'http://localhost:3000/auth/confirm?token_hash=invalid-token&type=email'
    );

    await expect(GET(request)).rejects.toThrow(
      'NEXT_REDIRECT:/auth/error?error=Invalid or expired token'
    );
    expect(mockRedirect).toHaveBeenCalledWith('/auth/error?error=Invalid or expired token');
  });

  it('should redirect to error page when token_hash is missing', async () => {
    const request = new NextRequest('http://localhost:3000/auth/confirm?type=email');

    await expect(GET(request)).rejects.toThrow(
      'NEXT_REDIRECT:/auth/error?error=No token hash or type'
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/auth/error?error=No token hash or type');
  });

  it('should redirect to error page when type is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/auth/confirm?token_hash=valid-token'
    );

    await expect(GET(request)).rejects.toThrow(
      'NEXT_REDIRECT:/auth/error?error=No token hash or type'
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('should redirect to error page when both token_hash and type are missing', async () => {
    const request = new NextRequest('http://localhost:3000/auth/confirm');

    await expect(GET(request)).rejects.toThrow(
      'NEXT_REDIRECT:/auth/error?error=No token hash or type'
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('should handle different OTP types', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const request = new NextRequest(
      'http://localhost:3000/auth/confirm?token_hash=valid-token&type=recovery'
    );

    await expect(GET(request)).rejects.toThrow('NEXT_REDIRECT:/');
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'recovery',
      token_hash: 'valid-token',
    });
  });
});
