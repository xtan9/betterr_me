/**
 * Puppeteer login script for Lighthouse CI.
 *
 * Authenticates as the test user before Lighthouse audits authenticated pages.
 * Requires E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {{url: string}} context
 */
module.exports = async (browser, context) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.warn('[lighthouse-auth] Missing credentials — skipping auth');
    return;
  }

  // Only authenticate for protected routes
  const protectedPaths = ['/dashboard', '/habits'];
  const url = new URL(context.url);
  if (!protectedPaths.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  const page = await browser.newPage();

  try {
    await page.goto(`${url.origin}/auth/login`, { waitUntil: 'networkidle0' });

    // Fill login form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);

    // Submit
    const submitButton = await page.waitForSelector(
      'button[type="submit"]',
      { timeout: 5000 }
    );
    await submitButton.click();

    // Wait for redirect to dashboard (session established)
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
    console.log(`[lighthouse-auth] Logged in for ${url.pathname}`);
  } catch (err) {
    console.error('[lighthouse-auth] Login failed:', err.message);
  } finally {
    await page.close();
  }
};
