/**
 * Safe redirect path validation.
 * Prevents open-redirect vulnerabilities by checking paths against an allowlist.
 */

import { log } from '@/lib/logger';

const ALLOWED_REDIRECT_PATHS = [
  "/",
  "/dashboard",
  "/habits",
  "/tasks",
  "/dashboard/settings",
];

const ALLOWED_REDIRECT_PREFIXES = ["/habits/", "/tasks/"];

/**
 * Validate and return a safe redirect path.
 * Returns "/" if the path is invalid, external, or not in the allowlist.
 *
 * @param next - The requested redirect path (from query param, etc.)
 * @returns A safe redirect path, preserving query params/hash if allowed
 */
export function getSafeRedirectPath(next: string | null): string {
  if (!next) {
    return "/";
  }

  // Block external URLs and protocol-relative URLs
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  // Strip query params and hash for matching
  const pathname = next.split("?")[0].split("#")[0];

  // Check exact matches
  if (ALLOWED_REDIRECT_PATHS.includes(pathname)) {
    return next; // Preserve original query params/hash
  }

  // Check prefix matches
  for (const prefix of ALLOWED_REDIRECT_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return next; // Preserve original query params/hash
    }
  }

  // No match — block the redirect
  log.warn("Blocked redirect to disallowed path", { path: next });
  return "/";
}
