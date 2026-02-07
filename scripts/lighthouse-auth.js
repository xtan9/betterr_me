/**
 * Puppeteer login script for Lighthouse CI.
 *
 * Authenticates as the test user before Lighthouse audits authenticated pages.
 * Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {{url: string}} context
 */
const { PROTECTED_PATHS } = require('./lighthouse-config');

module.exports = async (browser, context) => {
  // Only authenticate for protected routes — check path first so
  // public-page audits work even when credentials are absent.
  const url = new URL(context.url);
  if (!PROTECTED_PATHS.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '[lighthouse-auth] Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD'
    );
  }

  const page = await browser.newPage();

  try {
    await page.goto(`${url.origin}/auth/login`, { waitUntil: 'networkidle0' });

    // Fill login form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);

    // Submit and wait for URL change (Next.js uses client-side pushState
    // navigation, so waitForNavigation won't detect it)
    const submitButton = await page.waitForSelector(
      'button[type="submit"]',
      { timeout: 5000 }
    );
    await Promise.all([
      page.waitForFunction(
        () => window.location.pathname.startsWith('/dashboard'),
        { timeout: 15000 }
      ),
      submitButton.click(),
    ]);

    // Verify auth cookie was set
    const cookies = await page.cookies();
    const hasAuthCookie = cookies.some((c) => c.name.startsWith('sb-'));
    if (!hasAuthCookie) {
      throw new Error('Auth cookie not found after login');
    }

    console.log(`[lighthouse-auth] Logged in for ${url.pathname}`);
  } catch (err) {
    const msg = `[lighthouse-auth] Login failed for ${url.pathname}: ${err.message}`;
    console.error(msg);
    throw new Error(msg);
  } finally {
    await page.close();
  }
};
