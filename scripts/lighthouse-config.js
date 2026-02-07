/**
 * Shared Lighthouse CI configuration constants.
 *
 * Used by both lighthouserc.js (URL list) and lighthouse-auth.js (auth routing).
 * Keep these in sync — adding a protected path here automatically audits it
 * and triggers authentication in the Puppeteer script.
 */

const BASE_URL = 'http://localhost:3000';

const PUBLIC_PATHS = ['/', '/auth/login'];

const PROTECTED_PATHS = ['/dashboard', '/habits', '/dashboard/settings'];

module.exports = { BASE_URL, PUBLIC_PATHS, PROTECTED_PATHS };
