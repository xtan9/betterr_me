import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProfilesDB } from '@/lib/db';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  let resolvedUserId: string | null = null;
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return new NextResponse(
        renderHtml('Invalid Link', 'The unsubscribe link is invalid or missing.'),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    resolvedUserId = verifyUnsubscribeToken(token);

    if (!resolvedUserId) {
      return new NextResponse(
        renderHtml('Invalid Link', 'The unsubscribe link is invalid or has expired.'),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Use admin client to bypass RLS (user is not authenticated via browser)
    const supabase = createAdminClient();
    const profilesDB = new ProfilesDB(supabase);
    await profilesDB.updatePreferences(resolvedUserId, {
      email_notifications_enabled: false,
    });

    return new NextResponse(
      renderHtml('Unsubscribed', 'You have been unsubscribed from BetterR.Me email notifications. You can re-enable them in your settings at any time.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (error) {
    log.error(`Unsubscribe error${resolvedUserId ? ` for user ${resolvedUserId}` : ''}`, error);
    return new NextResponse(
      renderHtml('Error', 'Something went wrong. Please try again later.'),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHtml(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} - BetterR.Me</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f4f4f5; color: #18181b; }
    .card { background: white; padding: 48px; border-radius: 12px; text-align: center; max-width: 400px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: #0d9488; margin: 0 0 16px 0; font-size: 24px; }
    p { color: #3f3f46; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
}
