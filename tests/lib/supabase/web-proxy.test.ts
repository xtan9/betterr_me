// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from '@/lib/supabase/proxy';

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.create }));
vi.mock('@/lib/utils', () => ({ hasEnvVars: true }));

describe('web authentication redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
  });

  it('preserves a task deep link and its query through login', async () => {
    const response = await updateSession(new NextRequest(
      'https://www.betterr.me/tasks/weekly-review?view=details&next=https://untrusted.example',
    ));
    const destination = new URL(response.headers.get('location')!);

    expect(destination.pathname).toBe('/auth/login');
    expect(destination.searchParams.get('next')).toBe(
      '/tasks/weekly-review?view=details&next=https://untrusted.example',
    );
    expect([...destination.searchParams.keys()]).toEqual(['next']);
  });

  it.each([
    { path: '/', user: { id: 'user-1' }, destination: '/dashboard' },
    { path: '/tasks', user: null, destination: '/auth/login' },
  ])('keeps session cookie updates on the $path redirect', async ({ path, user, destination }) => {
    mocks.getUser.mockImplementation(async () => {
      const options = mocks.create.mock.calls[0][2];
      options.cookies.setAll([{
        name: 'sb-session',
        value: user ? 'refreshed-session' : '',
        options: { path: '/', httpOnly: true, secure: true, sameSite: 'lax' },
      }]);
      return { data: { user } };
    });

    const response = await updateSession(new NextRequest(`https://www.betterr.me${path}`));

    expect(new URL(response.headers.get('location')!).pathname).toBe(destination);
    expect(response.cookies.get('sb-session')).toMatchObject({
      value: user ? 'refreshed-session' : '',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  });
  it('lets anonymous Household Runway events reach their rate-limited public endpoint', async () => {
    const response = await updateSession(new NextRequest(
      'https://www.betterr.me/api/finance/cushion/events',
      { method: 'POST' },
    ));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(['/api/finance/cushion', '/api/finance/cushion/events-export'])(
    'keeps %s cookie-protected', async (path) => {
      const response = await updateSession(new NextRequest(`https://www.betterr.me${path}`));
      expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/login');
    },
  );
});
