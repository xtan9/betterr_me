import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // These routes perform their own authentication and return API errors rather
  // than browser redirects. Native routes verify bearer tokens; web Focus history
  // verifies its cookie session inside the route.
  const path = request.nextUrl.pathname;
  if (
    path === "/api/mobile/assistant" ||
    path === "/api/mobile/assistant/history" ||
    path === "/api/mobile/assistant/command" ||
    path === "/api/mobile/next-action" ||
    path === "/api/mobile/planning" ||
    path === "/api/mobile/planning/command" ||
    path === "/api/mobile/sleep" ||
    path === "/api/mobile/train/history" ||
    path === "/api/mobile/train/history/capabilities" ||
    path === "/api/mobile/train/history/commands" ||
    path === "/api/mobile/train/history/progress" ||
    /^\/api\/mobile\/train\/history\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path) ||
    path === "/api/mobile/train/plans" ||
    path === "/api/mobile/train/plans/commands" ||
    path === "/api/mobile/train/day" ||
    /^\/api\/mobile\/train\/plans\/(?:workouts\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path) ||
    path === "/api/mobile/train/templates" ||
    path === "/api/mobile/train/templates/commands" ||
    path === "/api/mobile/train/templates/capabilities" ||
    path === "/api/mobile/train/templates/definitions" ||
    /^\/api\/mobile\/train\/templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path) ||
    path === "/api/mobile/train/completions" ||
    path === "/api/mobile/train/prior-results" ||
    path === "/api/mobile/train/exercises" ||
    path === "/api/mobile/train/exercises/commands" ||
    path === "/api/mobile/train/exercises/capabilities" ||
    /^\/api\/mobile\/train\/exercises\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path) ||
    path === "/api/mobile/connections" ||
    path === "/api/mobile/connections/callback" ||
    path === "/api/mobile/execution" ||
    path === "/api/mobile/execution/settings" ||
    path === "/api/mobile/focus/history" ||
    path === "/api/focus/history" ||
    path === "/api/mobile/focus/app-limits/history" ||
    path === "/api/focus/app-limits/history" ||
    path === "/api/mobile/focus/app-limits/continuations" ||
    path === "/api/mobile/focus/app-limits/continuations/context" ||
    path === "/api/focus/app-limits/continuations" ||
    path === "/api/cron/assistant-reminders" ||
    path.startsWith("/mcp") ||
    path.startsWith("/.well-known") ||
    path.startsWith("/api/oauth")
  ) {
    return supabaseResponse;
  }

  // If the env vars are not set, skip middleware check. You can remove this once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect authenticated users from homepage to dashboard
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/finance/cushion") &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/.well-known") &&
    !request.nextUrl.pathname.startsWith("/api/oauth") &&
    !request.nextUrl.pathname.startsWith("/mcp")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}

