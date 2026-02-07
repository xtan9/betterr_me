import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock lighthouse-config before importing the module under test
vi.mock('../../scripts/lighthouse-config', () => ({
  PROTECTED_PATHS: ['/dashboard', '/habits', '/dashboard/settings'],
}));

describe('lighthouse-auth', () => {
  let lighthouseAuth;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.E2E_TEST_EMAIL = 'test@example.com';
    process.env.E2E_TEST_PASSWORD = 'password123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadModule() {
    lighthouseAuth = (await import('../../scripts/lighthouse-auth.js')).default;
  }

  function createMockBrowser(overrides = {}) {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue({
        click: vi.fn().mockResolvedValue(undefined),
      }),
      type: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      cookies: vi
        .fn()
        .mockResolvedValue([{ name: 'sb-access-token', value: 'abc' }]),
      close: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
    };
    return { mockBrowser, mockPage };
  }

  it('throws when E2E_TEST_EMAIL is missing', async () => {
    delete process.env.E2E_TEST_EMAIL;
    await loadModule();
    const { mockBrowser } = createMockBrowser();

    await expect(
      lighthouseAuth(mockBrowser, { url: 'http://localhost:3000/dashboard' })
    ).rejects.toThrow('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD');
  });

  it('throws when E2E_TEST_PASSWORD is missing', async () => {
    delete process.env.E2E_TEST_PASSWORD;
    await loadModule();
    const { mockBrowser } = createMockBrowser();

    await expect(
      lighthouseAuth(mockBrowser, { url: 'http://localhost:3000/dashboard' })
    ).rejects.toThrow('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD');
  });

  it('does not throw for public paths when credentials are missing', async () => {
    delete process.env.E2E_TEST_EMAIL;
    delete process.env.E2E_TEST_PASSWORD;
    await loadModule();
    const { mockBrowser } = createMockBrowser();

    // Should silently skip — no throw, no login attempt
    await lighthouseAuth(mockBrowser, {
      url: 'http://localhost:3000/auth/login',
    });

    expect(mockBrowser.newPage).not.toHaveBeenCalled();
  });

  it('skips authentication for public paths', async () => {
    await loadModule();
    const { mockBrowser } = createMockBrowser();

    await lighthouseAuth(mockBrowser, {
      url: 'http://localhost:3000/auth/login',
    });

    expect(mockBrowser.newPage).not.toHaveBeenCalled();
  });

  it('skips authentication for root path', async () => {
    await loadModule();
    const { mockBrowser } = createMockBrowser();

    await lighthouseAuth(mockBrowser, { url: 'http://localhost:3000/' });

    expect(mockBrowser.newPage).not.toHaveBeenCalled();
  });

  it('authenticates for /dashboard', async () => {
    await loadModule();
    const { mockBrowser, mockPage } = createMockBrowser();

    await lighthouseAuth(mockBrowser, {
      url: 'http://localhost:3000/dashboard',
    });

    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith(
      'http://localhost:3000/auth/login',
      { waitUntil: 'networkidle0' }
    );
    expect(mockPage.type).toHaveBeenCalledWith(
      'input[type="email"]',
      'test@example.com'
    );
    expect(mockPage.type).toHaveBeenCalledWith(
      'input[type="password"]',
      'password123'
    );
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('authenticates for /habits', async () => {
    await loadModule();
    const { mockBrowser, mockPage } = createMockBrowser();

    await lighthouseAuth(mockBrowser, {
      url: 'http://localhost:3000/habits',
    });

    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith(
      'http://localhost:3000/auth/login',
      { waitUntil: 'networkidle0' }
    );
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('authenticates for /dashboard/settings', async () => {
    await loadModule();
    const { mockBrowser, mockPage } = createMockBrowser();

    await lighthouseAuth(mockBrowser, {
      url: 'http://localhost:3000/dashboard/settings',
    });

    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('throws when auth cookie is not set after login', async () => {
    await loadModule();
    const { mockBrowser } = createMockBrowser({
      cookies: vi.fn().mockResolvedValue([]),
    });

    await expect(
      lighthouseAuth(mockBrowser, { url: 'http://localhost:3000/dashboard' })
    ).rejects.toThrow('Login failed');
  });

  it('closes the page even when login fails', async () => {
    await loadModule();
    const mockPage = {
      goto: vi.fn().mockRejectedValue(new Error('Navigation timeout')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
    };

    await expect(
      lighthouseAuth(mockBrowser, { url: 'http://localhost:3000/dashboard' })
    ).rejects.toThrow('Login failed');

    expect(mockPage.close).toHaveBeenCalled();
  });
});
